# Frontend Phase 1 (Scaffold, API Client, Gallery) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `frontend/` project (Vite + React + TypeScript) and ship the first working page — the Gallery — backed by a typed API client generated from the FastAPI OpenAPI schema.

**Architecture:** A Vite dev server proxies `/api/*` to the FastAPI backend (`localhost:8000`) during development; in production the existing "FastAPI serves `dist/`" model (unchanged by this plan) applies. `openapi-typescript` generates TypeScript types from the backend's live OpenAPI schema; `openapi-fetch` wraps `fetch` with those types for a fully-typed client; TanStack Query wraps the client in two hooks (`usePresets`, `useSavedProblems`) that the Gallery page consumes. React Router provides three routes, two of which are placeholders for later phases.

**Tech Stack:** Vite 8, React 19, TypeScript 7 (strict), Tailwind CSS 4 (CSS-first config), React Router 8, TanStack Query 5, openapi-typescript 7 + openapi-fetch 0.17, ESLint 10 (flat config) + Prettier 3, Vitest 5 + React Testing Library 16 + jsdom. Backend: FastAPI/SQLModel (existing).

**Spec:** `docs/superpowers/specs/2026-09-16-frontend-phase1-gallery-design.md`

## Global Constraints

- Package manager: **npm only** — no yarn/pnpm lockfiles.
- TypeScript **strict mode** on for all frontend code.
- Tailwind v4's CSS-first config (`@import "tailwindcss"` + `@theme` in CSS) — no `tailwind.config.js`.
- Visual design: Tailwind's `slate` scale for surfaces/text, a single custom accent token `--color-accent: #4f46e5` (indigo-600) for primary actions/links. Light mode only.
- Dev workflow: Vite dev server proxies `/api` to `http://localhost:8000`; the FastAPI backend runs separately (`uv run uvicorn makespan.main:app --reload`).
- `frontend/src/api/schema.ts` is **generated** (via `npm run generate-types`, which requires the backend running) and is committed to the repo like any other source file, but excluded from ESLint.
- No deployment/Docker/prod-static-serving changes in this plan — out of scope per spec.
- Every task must leave `uv run pytest` (backend) and, once `frontend/` exists, `npm run lint`, `npm test`, and `npm run build` (frontend) all green before committing.

---

## Task 1: Backend — `GET /api/problems` excludes presets and includes machine/job counts

The Gallery needs "presets" and "your problems" as disjoint sets, and needs machine/job counts for every card. `GET /api/problems` currently returns *all* `ProblemRecord` rows (including presets) via `ProblemSummary`, which only has `id`, `name`, `created_at` — no counts. This task fixes both gaps in one pass since they're the same endpoint/response model.

**Files:**
- Modify: `src/makespan/api/schemas.py` (`ProblemSummary`)
- Modify: `src/makespan/api/problems.py` (`list_problems`)
- Test: `tests/api/test_problems.py`

**Interfaces:**
- Produces: `GET /api/problems` response items now shaped `{id: string, name: string, created_at: string, machine_count: int, job_count: int}`, and never include an id from `PRESET_IDS` (`makespan.db.seed.PRESET_IDS`). Consumed by frontend Task 4's `useSavedProblems()`.

- [ ] **Step 1: Write the failing tests**

Add this import near the top of `tests/api/test_problems.py` (it currently starts with `from datetime import datetime`):

```python
from makespan.db.seed import PRESET_IDS
```

Add these two tests to `tests/api/test_problems.py`:

```python
def test_list_problems_excludes_presets(client):
    response = client.get("/api/problems")
    assert response.status_code == 200
    ids = {p["id"] for p in response.json()}
    assert ids.isdisjoint(set(PRESET_IDS))


def test_list_problems_includes_machine_and_job_counts(client):
    client.post(
        "/api/problems",
        json={
            "name": "Counts",
            "machines": ["M1", "M2"],
            "jobs": [
                {"operations": [{"machine_id": "M1", "duration": 1}]},
                {"operations": [{"machine_id": "M2", "duration": 2}]},
            ],
        },
    )
    response = client.get("/api/problems")
    entry = next(p for p in response.json() if p["name"] == "Counts")
    assert entry["machine_count"] == 2
    assert entry["job_count"] == 2
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/api/test_problems.py -v`
Expected: `test_list_problems_includes_machine_and_job_counts` FAILS with a `KeyError: 'machine_count'`. `test_list_problems_excludes_presets` may pass or fail depending on whether presets were seeded for that test run — either way, proceed to Step 3.

- [ ] **Step 3: Implement the fix**

In `src/makespan/api/schemas.py`, change `ProblemSummary` from:

```python
class ProblemSummary(BaseModel):
    id: str
    name: str
    created_at: datetime

    @field_serializer("created_at")
    def _serialize_created_at(self, value: datetime) -> datetime:
        return _as_utc(value)
```

to:

```python
class ProblemSummary(BaseModel):
    id: str
    name: str
    created_at: datetime
    machine_count: int
    job_count: int

    @field_serializer("created_at")
    def _serialize_created_at(self, value: datetime) -> datetime:
        return _as_utc(value)
```

In `src/makespan/api/problems.py`, add the import:

```python
from makespan.db.seed import PRESET_IDS
```

and change `list_problems` from:

```python
@router.get("", response_model=list[ProblemSummary])
def list_problems(session: Session = Depends(get_session)) -> list[ProblemSummary]:
    records = session.exec(select(ProblemRecord)).all()
    return [ProblemSummary(id=r.id, name=r.name, created_at=r.created_at) for r in records]
```

to:

```python
@router.get("", response_model=list[ProblemSummary])
def list_problems(session: Session = Depends(get_session)) -> list[ProblemSummary]:
    records = session.exec(
        select(ProblemRecord).where(ProblemRecord.id.notin_(PRESET_IDS))
    ).all()
    return [
        ProblemSummary(
            id=r.id,
            name=r.name,
            created_at=r.created_at,
            machine_count=len(r.machines),
            job_count=len(r.jobs),
        )
        for r in records
    ]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/api/test_problems.py -v`
Expected: all tests PASS, including the two new ones.

- [ ] **Step 5: Run the full backend suite**

Run: `uv run pytest`
Expected: all tests PASS (no regressions in `test_presets.py`, `test_seed.py`, etc.).

- [ ] **Step 6: Commit**

```bash
git add src/makespan/api/schemas.py src/makespan/api/problems.py tests/api/test_problems.py
git commit -m "$(cat <<'EOF'
feat: exclude presets and add machine/job counts to GET /api/problems

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Frontend scaffold — Vite + React + TypeScript + Tailwind + ESLint + Prettier + Vitest

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/tsconfig.app.json`
- Create: `frontend/tsconfig.node.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/vitest.setup.ts`
- Create: `frontend/eslint.config.js`
- Create: `frontend/.prettierrc`
- Create: `frontend/.prettierignore`
- Create: `frontend/.gitignore`
- Create: `frontend/index.html`
- Create: `frontend/src/vite-env.d.ts`
- Create: `frontend/src/index.css`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Test: `frontend/src/App.test.tsx`

**Interfaces:**
- Produces: a running Vite project at `frontend/` with `npm run dev`, `npm run build`, `npm run lint`, `npm test`, `npm run generate-types` scripts. `App` default-exported from `frontend/src/App.tsx`, consumed by `frontend/src/main.tsx` (and replaced/extended by Task 3).

- [ ] **Step 1: Create the directory and package manifest**

```bash
mkdir -p frontend/src
```

Create `frontend/package.json`:

```json
{
  "name": "makespan-frontend",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "format": "prettier --write .",
    "test": "vitest run",
    "generate-types": "openapi-typescript http://localhost:8000/openapi.json -o src/api/schema.ts"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router": "^8.0.0",
    "@tanstack/react-query": "^5.0.0",
    "openapi-fetch": "^0.17.0"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.0",
    "@tailwindcss/vite": "^4.0.0",
    "@testing-library/jest-dom": "^7.0.0",
    "@testing-library/react": "^16.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^6.0.0",
    "eslint": "^10.0.0",
    "eslint-plugin-react-hooks": "^7.0.0",
    "eslint-plugin-react-refresh": "^0.5.0",
    "globals": "^17.0.0",
    "jsdom": "^30.0.0",
    "openapi-typescript": "^7.0.0",
    "prettier": "^3.0.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^7.0.0",
    "typescript-eslint": "^8.0.0",
    "vite": "^8.0.0",
    "vitest": "^5.0.0"
  }
}
```

- [ ] **Step 2: Create TypeScript configs**

Create `frontend/tsconfig.json`:

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

Create `frontend/tsconfig.app.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"]
}
```

Create `frontend/tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 3: Create Vite, Vitest, ESLint, Prettier, and ignore configs**

Create `frontend/vite.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './vitest.setup.ts',
  },
})
```

Create `frontend/vitest.setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
```

Create `frontend/eslint.config.js`:

```js
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'src/api/schema.ts'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
)
```

(`src/api/schema.ts` is ignored pre-emptively here — it's generated in Task 4 but this avoids having to touch this file again later.)

Create `frontend/.prettierrc`:

```json
{
  "semi": true,
  "singleQuote": true,
  "printWidth": 100,
  "trailingComma": "all"
}
```

Create `frontend/.prettierignore`:

```
dist
coverage
src/api/schema.ts
```

Create `frontend/.gitignore`:

```
node_modules
dist
coverage
```

- [ ] **Step 4: Create the HTML entry point and static app shell files**

Create `frontend/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Makespan</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `frontend/src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />
```

Create `frontend/src/index.css`:

```css
@import "tailwindcss";

@theme {
  --color-accent: #4f46e5;
}
```

Create `frontend/src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 5: Write the failing smoke test**

Create `frontend/src/App.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders the app heading', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Makespan' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Install dependencies and run the test to verify it fails**

```bash
cd frontend
npm install
npx vitest run src/App.test.tsx
```

Expected: FAIL — `frontend/src/App.tsx` does not exist yet.

- [ ] **Step 7: Implement `App.tsx`**

Create `frontend/src/App.tsx`:

```tsx
function App() {
  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <h1 className="text-2xl font-semibold text-slate-900">Makespan</h1>
    </main>
  )
}

export default App
```

- [ ] **Step 8: Run the test to verify it passes**

```bash
npx vitest run src/App.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Run the full frontend check suite**

```bash
npm run lint
npm test
npm run build
```

Expected: all three succeed with no errors.

- [ ] **Step 10: Verify the dev proxy against the real backend**

In one terminal, from the repo root:

```bash
uv run uvicorn makespan.main:app --reload
```

In another terminal:

```bash
cd frontend
npm run dev
```

Then, in a third terminal, confirm the proxy forwards to the backend:

```bash
curl -s http://localhost:5173/api/health
```

Expected: `{"status":"ok"}` (the same response `curl http://localhost:8000/api/health` would give directly). Stop both dev servers once confirmed.

- [ ] **Step 11: Commit**

```bash
git add frontend
git commit -m "$(cat <<'EOF'
feat: scaffold Vite + React + TypeScript frontend

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Routing shell — Gallery/Builder placeholder routes

**Files:**
- Create: `frontend/src/routes/ComingSoonPage.tsx`
- Create: `frontend/src/AppRoutes.tsx`
- Modify: `frontend/src/App.tsx`
- Delete: `frontend/src/App.test.tsx` (superseded by `AppRoutes.test.tsx` below — `App.tsx` no longer renders a heading directly)
- Test: `frontend/src/AppRoutes.test.tsx`

**Interfaces:**
- Consumes: none new.
- Produces: `AppRoutes` (named export, no props) from `frontend/src/AppRoutes.tsx`, rendering `<Routes>` for `/`, `/problems/new`, `/problems/:id` — consumed by `frontend/src/App.tsx` (this task) and modified by Task 5 (which swaps the `/` route's element). `ComingSoonPage` (named export, props `{ title: string }`) from `frontend/src/routes/ComingSoonPage.tsx`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/routes/ComingSoonPage.tsx` is created in Step 3 below; write the test first against the not-yet-existing `AppRoutes`.

Create `frontend/src/AppRoutes.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router'
import { AppRoutes } from './AppRoutes'

describe('AppRoutes', () => {
  it('renders a placeholder for the new-problem route', () => {
    render(
      <MemoryRouter initialEntries={['/problems/new']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    expect(screen.getByText(/problem builder is coming/i)).toBeInTheDocument()
  })

  it('renders a placeholder for an existing-problem route', () => {
    render(
      <MemoryRouter initialEntries={['/problems/abc-123']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    expect(screen.getByText(/problem builder is coming/i)).toBeInTheDocument()
  })

  it('renders a placeholder for the root route', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    expect(screen.getByText(/gallery is coming/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend
npx vitest run src/AppRoutes.test.tsx
```

Expected: FAIL — `frontend/src/AppRoutes.tsx` does not exist.

- [ ] **Step 3: Implement `ComingSoonPage` and `AppRoutes`**

Create `frontend/src/routes/ComingSoonPage.tsx`:

```tsx
type ComingSoonPageProps = {
  title: string
}

export function ComingSoonPage({ title }: ComingSoonPageProps) {
  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <p className="text-slate-600">{title} is coming in a later phase.</p>
    </main>
  )
}
```

Create `frontend/src/AppRoutes.tsx`:

```tsx
import { Route, Routes } from 'react-router'
import { ComingSoonPage } from './routes/ComingSoonPage'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<ComingSoonPage title="The gallery" />} />
      <Route path="/problems/new" element={<ComingSoonPage title="The problem builder" />} />
      <Route path="/problems/:id" element={<ComingSoonPage title="The problem builder" />} />
    </Routes>
  )
}
```

Replace `frontend/src/App.tsx` with:

```tsx
import { BrowserRouter } from 'react-router'
import { AppRoutes } from './AppRoutes'

function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}

export default App
```

Delete `frontend/src/App.test.tsx`:

```bash
rm frontend/src/App.test.tsx
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/AppRoutes.test.tsx
```

Expected: PASS (all three cases).

- [ ] **Step 5: Run the full frontend check suite**

```bash
npm run lint
npm test
npm run build
```

Expected: all succeed.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.tsx frontend/src/AppRoutes.tsx frontend/src/AppRoutes.test.tsx frontend/src/routes
git rm frontend/src/App.test.tsx
git commit -m "$(cat <<'EOF'
feat: add routing shell with Gallery/Builder placeholder routes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Typed API client — generated types + `usePresets`/`useSavedProblems`

**Files:**
- Create: `frontend/src/api/schema.ts` (generated, not hand-written)
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/api/queries.ts`
- Test: `frontend/src/api/queries.test.tsx`
- Modify: `frontend/src/main.tsx`

**Interfaces:**
- Consumes: none new.
- Produces: `apiClient` from `frontend/src/api/client.ts` (an `openapi-fetch` client typed against the generated `paths`). `usePresets()` and `useSavedProblems()` (named exports, no args) from `frontend/src/api/queries.ts`, each a TanStack Query `useQuery` result whose `.data` is, respectively, an array shaped like `{id, name, created_at, machines, jobs, constraints}` (presets) and `{id, name, created_at, machine_count, job_count}` (saved problems) — consumed by Task 5's `GalleryPage`.

- [ ] **Step 1: Generate the typed schema from the running backend**

In one terminal, from the repo root:

```bash
uv run uvicorn makespan.main:app --reload
```

In another terminal:

```bash
cd frontend
npm run generate-types
```

Expected: `frontend/src/api/schema.ts` is created, containing `export interface paths {` with entries for `"/api/presets"` and `"/api/problems"`. Stop the backend once this succeeds.

- [ ] **Step 2: Create the typed fetch client**

Create `frontend/src/api/client.ts`:

```ts
import createClient from 'openapi-fetch'
import type { paths } from './schema'

export const apiClient = createClient<paths>({ baseUrl: '' })
```

- [ ] **Step 3: Write the failing tests for the query hooks**

Create `frontend/src/api/queries.test.tsx`:

```tsx
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePresets, useSavedProblems } from './queries'

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('usePresets', () => {
  it('fetches and returns presets', async () => {
    const presets = [
      {
        id: 'preset-ft06',
        name: 'FT06',
        machines: ['M0'],
        jobs: [],
        constraints: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(presets)))

    const { result } = renderHook(() => usePresets(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(presets)
    expect(fetch).toHaveBeenCalledWith('/api/presets', expect.anything())
  })
})

describe('useSavedProblems', () => {
  it('fetches and returns saved problems', async () => {
    const problems = [
      {
        id: 'abc',
        name: 'My problem',
        created_at: '2026-01-01T00:00:00Z',
        machine_count: 2,
        job_count: 3,
      },
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(problems)))

    const { result } = renderHook(() => useSavedProblems(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(problems)
    expect(fetch).toHaveBeenCalledWith('/api/problems', expect.anything())
  })
})
```

- [ ] **Step 4: Run the tests to verify they fail**

```bash
cd frontend
npx vitest run src/api/queries.test.tsx
```

Expected: FAIL — `frontend/src/api/queries.ts` does not exist.

- [ ] **Step 5: Implement the query hooks**

Create `frontend/src/api/queries.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { apiClient } from './client'

export function usePresets() {
  return useQuery({
    queryKey: ['presets'],
    queryFn: async () => {
      const { data, error } = await apiClient.GET('/api/presets')
      if (error) throw error
      return data
    },
  })
}

export function useSavedProblems() {
  return useQuery({
    queryKey: ['problems'],
    queryFn: async () => {
      const { data, error } = await apiClient.GET('/api/problems')
      if (error) throw error
      return data
    },
  })
}
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
npx vitest run src/api/queries.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Wire the query client into the app**

Replace `frontend/src/main.tsx` with:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
```

- [ ] **Step 8: Run the full frontend check suite**

```bash
npm run lint
npm test
npm run build
```

Expected: all succeed. (`eslint.config.js` already ignores `src/api/schema.ts` from Task 2 Step 3, so the generated file doesn't need any lint fixes.)

- [ ] **Step 9: Commit**

```bash
git add frontend/src/api frontend/src/main.tsx
git commit -m "$(cat <<'EOF'
feat: add typed API client and presets/problems query hooks

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Gallery page — cards, sections, loading/error/empty states

**Files:**
- Create: `frontend/src/gallery/relativeTime.ts`
- Test: `frontend/src/gallery/relativeTime.test.ts`
- Create: `frontend/src/gallery/ProblemCard.tsx`
- Create: `frontend/src/gallery/GalleryPage.tsx`
- Test: `frontend/src/gallery/GalleryPage.test.tsx`
- Modify: `frontend/src/AppRoutes.tsx`

**Interfaces:**
- Consumes: `usePresets`, `useSavedProblems` from `frontend/src/api/queries.ts` (Task 4).
- Produces: `GalleryPage` (named export, no props) from `frontend/src/gallery/GalleryPage.tsx`, wired into `AppRoutes`'s `/` route.

- [ ] **Step 1: Write the failing test for the relative-time helper**

Create `frontend/src/gallery/relativeTime.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatRelativeTime } from './relativeTime'

describe('formatRelativeTime', () => {
  const now = new Date('2026-09-16T12:00:00Z')

  it('formats a time from two days ago', () => {
    expect(formatRelativeTime('2026-09-14T12:00:00Z', now)).toBe('2 days ago')
  })

  it('formats a time from a few minutes ago', () => {
    expect(formatRelativeTime('2026-09-16T11:55:00Z', now)).toBe('5 minutes ago')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd frontend
npx vitest run src/gallery/relativeTime.test.ts
```

Expected: FAIL — `frontend/src/gallery/relativeTime.ts` does not exist.

- [ ] **Step 3: Implement the relative-time helper**

Create `frontend/src/gallery/relativeTime.ts`:

```ts
const DIVISIONS: { amount: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { amount: 60, unit: 'seconds' },
  { amount: 60, unit: 'minutes' },
  { amount: 24, unit: 'hours' },
  { amount: 7, unit: 'days' },
  { amount: 4.34524, unit: 'weeks' },
  { amount: 12, unit: 'months' },
  { amount: Number.POSITIVE_INFINITY, unit: 'years' },
]

const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

export function formatRelativeTime(isoString: string, now: Date = new Date()): string {
  let duration = (new Date(isoString).getTime() - now.getTime()) / 1000

  for (const division of DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return formatter.format(Math.round(duration), division.unit)
    }
    duration /= division.amount
  }

  return formatter.format(Math.round(duration), 'years')
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
npx vitest run src/gallery/relativeTime.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write the failing tests for the Gallery page**

Create `frontend/src/gallery/GalleryPage.test.tsx`:

```tsx
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GalleryPage } from './GalleryPage'

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('GalleryPage', () => {
  it('shows skeleton cards while loading', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))

    render(<GalleryPage />, { wrapper })

    expect(screen.getAllByTestId('card-skeleton').length).toBeGreaterThan(0)
  })

  it('renders presets and saved problems as cards linking to the builder', async () => {
    const preset = {
      id: 'preset-ft06',
      name: 'FT06 (6x6 benchmark, optimal makespan 55)',
      machines: ['M0', 'M1'],
      jobs: [{}],
      constraints: {},
      created_at: '2026-01-01T00:00:00Z',
    }
    const saved = {
      id: 'abc-123',
      name: 'My problem',
      created_at: '2026-09-14T12:00:00Z',
      machine_count: 3,
      job_count: 2,
    }
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve(
          url.toString().includes('/api/presets') ? jsonResponse([preset]) : jsonResponse([saved]),
        ),
      ),
    )

    render(<GalleryPage />, { wrapper })

    const presetLink = await screen.findByRole('link', { name: /ft06/i })
    expect(presetLink).toHaveAttribute('href', '/problems/preset-ft06')

    const savedLink = screen.getByRole('link', { name: /my problem/i })
    expect(savedLink).toHaveAttribute('href', '/problems/abc-123')
  })

  it('shows an empty-state prompt when there are no saved problems', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse([]))))

    render(<GalleryPage />, { wrapper })

    expect(await screen.findByText(/don't have any saved problems yet/i)).toBeInTheDocument()
  })

  it('shows an error message with a retry action when a fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse({ detail: 'boom' }, 500))))

    render(<GalleryPage />, { wrapper })

    expect((await screen.findAllByText(/couldn't load/i)).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: /retry/i }).length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 6: Run the tests to verify they fail**

```bash
cd frontend
npx vitest run src/gallery/GalleryPage.test.tsx
```

Expected: FAIL — `frontend/src/gallery/GalleryPage.tsx` (and `ProblemCard.tsx`) don't exist.

- [ ] **Step 7: Implement `ProblemCard`**

Create `frontend/src/gallery/ProblemCard.tsx`:

```tsx
import { Link } from 'react-router'

type ProblemCardProps = {
  id: string
  name: string
  machineCount: number
  jobCount: number
  subtitle?: string
}

export function ProblemCard({ id, name, machineCount, jobCount, subtitle }: ProblemCardProps) {
  return (
    <Link
      to={`/problems/${id}`}
      className="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-accent hover:shadow-md"
    >
      <h3 className="font-medium text-slate-900">{name}</h3>
      <p className="mt-1 text-sm text-slate-500">
        {machineCount} {machineCount === 1 ? 'machine' : 'machines'} · {jobCount}{' '}
        {jobCount === 1 ? 'job' : 'jobs'}
      </p>
      {subtitle ? <p className="mt-2 text-xs text-slate-400">{subtitle}</p> : null}
    </Link>
  )
}
```

- [ ] **Step 8: Implement `GalleryPage`**

Create `frontend/src/gallery/GalleryPage.tsx`:

```tsx
import { Link } from 'react-router'
import { usePresets, useSavedProblems } from '../api/queries'
import { ProblemCard } from './ProblemCard'
import { formatRelativeTime } from './relativeTime'

function CardSkeleton() {
  return <div data-testid="card-skeleton" className="h-24 animate-pulse rounded-lg bg-slate-100" />
}

export function GalleryPage() {
  const presets = usePresets()
  const savedProblems = useSavedProblems()

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-semibold text-slate-900">Makespan</h1>

      <section className="mt-8">
        <h2 className="text-lg font-medium text-slate-800">Presets</h2>
        {presets.isPending ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : presets.isError ? (
          <div className="mt-4 text-sm text-red-600">
            Couldn't load presets.{' '}
            <button className="underline" onClick={() => presets.refetch()}>
              Retry
            </button>
          </div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {presets.data.map((preset) => (
              <ProblemCard
                key={preset.id}
                id={preset.id}
                name={preset.name}
                machineCount={preset.machines.length}
                jobCount={preset.jobs.length}
              />
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-slate-800">Your Problems</h2>
          <Link
            to="/problems/new"
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            New Problem
          </Link>
        </div>
        {savedProblems.isPending ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <CardSkeleton />
          </div>
        ) : savedProblems.isError ? (
          <div className="mt-4 text-sm text-red-600">
            Couldn't load your problems.{' '}
            <button className="underline" onClick={() => savedProblems.refetch()}>
              Retry
            </button>
          </div>
        ) : savedProblems.data.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            You don't have any saved problems yet. Start with{' '}
            <Link to="/problems/new" className="text-accent underline">
              New Problem
            </Link>
            .
          </p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {savedProblems.data.map((problem) => (
              <ProblemCard
                key={problem.id}
                id={problem.id}
                name={problem.name}
                machineCount={problem.machine_count}
                jobCount={problem.job_count}
                subtitle={formatRelativeTime(problem.created_at)}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
```

- [ ] **Step 9: Run the tests to verify they pass**

```bash
npx vitest run src/gallery/GalleryPage.test.tsx
```

Expected: PASS (all four cases).

- [ ] **Step 10: Wire `GalleryPage` into the root route**

In `frontend/src/AppRoutes.tsx`, add the import and swap the `/` route's element:

```tsx
import { Route, Routes } from 'react-router'
import { ComingSoonPage } from './routes/ComingSoonPage'
import { GalleryPage } from './gallery/GalleryPage'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<GalleryPage />} />
      <Route path="/problems/new" element={<ComingSoonPage title="The problem builder" />} />
      <Route path="/problems/:id" element={<ComingSoonPage title="The problem builder" />} />
    </Routes>
  )
}
```

- [ ] **Step 11: Update `AppRoutes.test.tsx`'s root-route case**

In `frontend/src/AppRoutes.test.tsx`, the third test ("renders a placeholder for the root route") now renders the real `GalleryPage`, which needs a `QueryClientProvider` ancestor. Replace that whole test file with:

```tsx
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { AppRoutes } from './AppRoutes'

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('AppRoutes', () => {
  it('renders a placeholder for the new-problem route', () => {
    render(
      <MemoryRouter initialEntries={['/problems/new']}>
        <AppRoutes />
      </MemoryRouter>,
      { wrapper },
    )
    expect(screen.getByText(/problem builder is coming/i)).toBeInTheDocument()
  })

  it('renders a placeholder for an existing-problem route', () => {
    render(
      <MemoryRouter initialEntries={['/problems/abc-123']}>
        <AppRoutes />
      </MemoryRouter>,
      { wrapper },
    )
    expect(screen.getByText(/problem builder is coming/i)).toBeInTheDocument()
  })

  it('renders the Gallery on the root route', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
      { wrapper },
    )
    expect(screen.getByRole('heading', { name: 'Makespan' })).toBeInTheDocument()
    vi.unstubAllGlobals()
  })
})
```

- [ ] **Step 12: Run the full frontend check suite**

```bash
npm run lint
npm test
npm run build
```

Expected: all succeed.

- [ ] **Step 13: Commit**

```bash
git add frontend/src/gallery frontend/src/AppRoutes.tsx frontend/src/AppRoutes.test.tsx
git commit -m "$(cat <<'EOF'
feat: add Gallery page with preset/saved-problem cards

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Docs + end-to-end manual smoke check

**Files:**
- Modify: `README.md`

**Interfaces:**
- None (documentation + manual verification only).

- [ ] **Step 1: Add a Frontend section to the README**

In `README.md`, after the existing "## Run the dev server" section and before "## API overview", add:

```markdown
## Frontend

The frontend lives in `frontend/` (Vite + React + TypeScript). Run the
backend and frontend as two separate processes during development:

```bash
# terminal 1: backend
uv run uvicorn makespan.main:app --reload

# terminal 2: frontend
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api/*` requests to `http://localhost:8000`,
so open the URL Vite prints (typically `http://localhost:5173`) once both
are running.

After a backend schema change, regenerate the typed API client (requires
the backend running):

```bash
cd frontend
npm run generate-types
```

Frontend checks:

```bash
cd frontend
npm run lint
npm test
npm run build
```
```

- [ ] **Step 2: Run the full smoke check**

In one terminal:

```bash
uv run uvicorn makespan.main:app --reload
```

In another:

```bash
cd frontend
npm run dev
```

In a third, confirm the proxy reaches both endpoints the Gallery depends on:

```bash
curl -s http://localhost:5173/api/presets | head -c 200
curl -s http://localhost:5173/api/problems
```

Expected: the first returns the seeded preset problems (non-empty JSON array); the second returns `[]` on a fresh database (or your saved problems, minus any presets, if you've created some).

Then open `http://localhost:5173` in a browser and confirm:
- A "Presets" section shows four cards (two-machine demo, three-machine demo, FT06, LA01).
- A "Your Problems" section shows either the empty-state prompt or your saved problems.
- Clicking any card navigates to `/problems/<id>` and shows "The problem builder is coming in a later phase."
- Clicking "New Problem" navigates to `/problems/new` with the same placeholder text.

Stop both dev servers once confirmed.

- [ ] **Step 3: Run the full backend and frontend suites one more time**

```bash
uv run pytest
cd frontend && npm run lint && npm test && npm run build
```

Expected: everything passes.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs: document frontend dev workflow

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
