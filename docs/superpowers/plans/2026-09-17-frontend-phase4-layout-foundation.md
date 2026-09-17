# Frontend Phase 4 — Layout Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the app's per-page, independently-centered layout with a shared layout foundation: a persistent left-aligned nav rail plus page-appropriate content widths (Gallery, Solve), so data-dense pages use the available window instead of living in a narrow centered column.

**Architecture:** A new `AppShell` component renders the nav rail and a react-router `<Outlet />`. `AppRoutes.tsx` is restructured so `AppShell` becomes a parent layout route wrapping the four existing routes as its `children` — every route's own `path`/`element` is unchanged, just nested one level deeper. Gallery and Solve switch their `<main>` from a fixed `max-w-4xl` to a new shared `--content-max-width: 1600px` CSS token; Builder is untouched.

**Tech Stack:** React 19, react-router v8 (data router, `createBrowserRouter`/`createMemoryRouter`), Tailwind CSS v4 (`@theme` custom properties, `max-w-(--var)` arbitrary-value syntax), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-17-frontend-phase4-layout-foundation-design.md`

## Global Constraints

- Content soft-max width is **1600px**, defined once as the `--content-max-width` CSS custom property in `frontend/src/index.css`, referenced via Tailwind v4's arbitrary-value-from-custom-property syntax `max-w-(--content-max-width)`. Applies to Gallery and Solve only — never Builder.
- The nav rail is a fixed `w-48` (192px) width at every viewport size, left-aligned, persistent, branding-only (just the "Makespan" wordmark linking to `/`). No icons, no collapse/expand state, no additional nav items.
- The nav rail is **not sticky/pinned** — it scrolls with the page in normal document flow.
- Gallery's card grids use fixed breakpoint columns `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`, capped at 4 columns regardless of viewport width. Never an uncapped `auto-fill`/`minmax()` grid.
- `frontend/src/builder/BuilderForm.tsx` gets **no changes** — same `max-w-3xl` width, same structure. Only its wrapping context changes (now rendered inside `AppShell`'s `<Outlet />` instead of directly in the document body).
- No backend changes.
- No dark mode work (standing constraint carried from Phase 1).
- Mobile/narrow-viewport nav collapse is explicitly out of scope — do not implement a hamburger menu or any responsive collapse behavior for the rail.
- Gantt-internal responsive width/row-height decoupling (measuring container width via `ResizeObserver`) is explicitly out of scope — do not touch `GanttChart.tsx`/`GanttBar.tsx`/`layout.ts` in this plan.
- `frontend/` CI gate (must all pass before this branch is done): `npm run lint`, `npm test`, `npm run build`, `npm run check-types-fresh`.

---

### Task 1: Shared content-width CSS token

**Files:**
- Modify: `frontend/src/index.css`

**Interfaces:**
- Consumes: nothing.
- Produces: the `--content-max-width` CSS custom property (value `1600px`), consumed by Task 4 (Gallery) and Task 5 (Solve) via Tailwind's `max-w-(--content-max-width)` arbitrary-value syntax.

- [ ] **Step 1: Add the token**

Current `frontend/src/index.css`:

```css
@import "tailwindcss";

@theme {
  --color-accent: #4f46e5;
}
```

Change to:

```css
@import "tailwindcss";

@theme {
  --color-accent: #4f46e5;
  --content-max-width: 1600px;
}
```

- [ ] **Step 2: Verify the build still compiles**

Run: `npm run build`
Expected: build succeeds (no CSS syntax errors). This is the only verification available for a bare token addition — nothing consumes it yet, so no visual or test check applies until Task 4.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/index.css
git commit -m "feat: add shared content-max-width design token"
```

---

### Task 2: `AppShell` component

**Files:**
- Create: `frontend/src/AppShell.tsx`
- Test: `frontend/src/AppShell.test.tsx`

**Interfaces:**
- Consumes: `Link`, `Outlet` from `react-router`.
- Produces: `AppShell` — a component with no props, rendering a persistent nav rail (a "Makespan" link to `/`) beside an `<Outlet />` for the matched child route. Consumed by Task 3 as the new parent layout route in `AppRoutes.tsx`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/AppShell.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import { AppShell } from './AppShell'

function renderShellWithChild(childContent: string) {
  const router = createMemoryRouter([
    {
      element: <AppShell />,
      children: [{ path: '/', element: <div>{childContent}</div> }],
    },
  ])
  return render(<RouterProvider router={router} />)
}

describe('AppShell', () => {
  it('renders the Makespan link to the root route', () => {
    renderShellWithChild('child content')

    const link = screen.getByRole('link', { name: 'Makespan' })
    expect(link).toHaveAttribute('href', '/')
  })

  it("renders the matched child route's content via the Outlet", () => {
    renderShellWithChild('child content')

    expect(screen.getByText('child content')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/AppShell.test.tsx`
Expected: FAIL — `./AppShell` does not exist yet (module not found).

- [ ] **Step 3: Create `AppShell.tsx`**

```tsx
import { Link, Outlet } from 'react-router'

export function AppShell() {
  return (
    <div className="flex min-h-screen">
      <nav className="w-48 shrink-0 border-r border-slate-200 p-4">
        <Link to="/" className="text-lg font-semibold text-slate-900">
          Makespan
        </Link>
      </nav>
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npx vitest run src/AppShell.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/AppShell.tsx frontend/src/AppShell.test.tsx
git commit -m "feat: add AppShell layout component with persistent nav rail"
```

---

### Task 3: Nest routes under `AppShell`

**Files:**
- Modify: `frontend/src/AppRoutes.tsx`

**Interfaces:**
- Consumes: `AppShell` from `./AppShell` (Task 2).
- Produces: `routes: RouteObject[]` — same exported shape and same four `path`/`element` pairs as before, now nested one level under a parent layout route. `App.tsx`'s `createBrowserRouter(routes)` call is unaffected (no changes needed there).

- [ ] **Step 1: Restructure `AppRoutes.tsx`**

Current `frontend/src/AppRoutes.tsx`:

```tsx
import type { RouteObject } from 'react-router'
import { GalleryPage } from './gallery/GalleryPage'
import { BuilderPage } from './builder/BuilderPage'
import { SolvePage } from './solve/SolvePage'

export const routes: RouteObject[] = [
  { path: '/', element: <GalleryPage /> },
  { path: '/problems/new', element: <BuilderPage /> },
  { path: '/problems/:id', element: <BuilderPage /> },
  { path: '/problems/:id/solves/:solveId', element: <SolvePage /> },
]
```

Change to:

```tsx
import type { RouteObject } from 'react-router'
import { AppShell } from './AppShell'
import { GalleryPage } from './gallery/GalleryPage'
import { BuilderPage } from './builder/BuilderPage'
import { SolvePage } from './solve/SolvePage'

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <GalleryPage /> },
      { path: '/problems/new', element: <BuilderPage /> },
      { path: '/problems/:id', element: <BuilderPage /> },
      { path: '/problems/:id/solves/:solveId', element: <SolvePage /> },
    ],
  },
]
```

- [ ] **Step 2: Run the full suite to confirm no regressions**

This is a pure structural change — every route's `path`/`element` is identical, only nested deeper, and `createMemoryRouter`/`createBrowserRouter` resolve nested routes transparently. There is no new behavior to write a new test for; the check is that nothing existing broke.

Run: `npm test`
Expected: PASS, including `src/AppRoutes.test.tsx` (all 4 existing route-matching tests, unchanged in this task), `src/gallery/GalleryPage.test.tsx`, `src/builder/BuilderPage.test.tsx`, `src/solve/SolvePage.test.tsx` — none of those files render through `AppRoutes`/`AppShell`, so they're unaffected by this change.

- [ ] **Step 3: Manual smoke check**

Run: `npm run dev`, open the app in a browser, and confirm the nav rail with the "Makespan" link now appears beside the Gallery, Builder, and Solve pages, and that clicking "Makespan" navigates to `/`. This is a structural routing change with no automated visual check, so a manual look is the only way to catch a broken layout before it lands.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/AppRoutes.tsx
git commit -m "feat: nest app routes under AppShell layout route"
```

---

### Task 4: Widen Gallery, responsive grid, rename heading

**Files:**
- Modify: `frontend/src/gallery/GalleryPage.tsx`
- Modify: `frontend/src/AppRoutes.test.tsx`

**Interfaces:**
- Consumes: `--content-max-width` token (Task 1) via `max-w-(--content-max-width)`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Update `GalleryPage.tsx`**

In `frontend/src/gallery/GalleryPage.tsx`, make these four changes:

1. Line 15 — widen the `<main>`:

```tsx
// Before
    <main className="mx-auto max-w-4xl p-8">
// After
    <main className="mx-auto max-w-(--content-max-width) p-8">
```

2. Line 16 — rename the heading (the "Makespan" name now lives in the persistent nav, so repeating it as the page heading is redundant):

```tsx
// Before
      <h1 className="text-2xl font-semibold text-slate-900">Makespan</h1>
// After
      <h1 className="text-2xl font-semibold text-slate-900">Gallery</h1>
```

3. Every occurrence of the card-grid class — lines 21, 33, 58, and 77 (the Presets loading skeleton, the Presets data grid, the Your Problems loading skeleton, and the Your Problems data grid) — changes from:

```tsx
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
```

to:

```tsx
      <div className="mt-4 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
```

Apply this to all four occurrences (both loading-skeleton grids and both data grids) — the skeleton should reflow at the same breakpoints as the loaded content it stands in for, otherwise the layout visibly jumps columns the instant data arrives.

- [ ] **Step 2: Update the heading assertion in `AppRoutes.test.tsx`**

`frontend/src/AppRoutes.test.tsx` line 37 currently asserts the old heading text:

```tsx
// Before
    expect(screen.getByRole('heading', { name: 'Makespan' })).toBeInTheDocument()
// After
    expect(screen.getByRole('heading', { name: 'Gallery' })).toBeInTheDocument()
```

This is the only test file asserting on this heading text — `GalleryPage.test.tsx` does not assert on it (confirmed by reading that file in full during planning).

- [ ] **Step 3: Run the tests**

Run: `npm test`
Expected: PASS. `src/AppRoutes.test.tsx`'s `'renders the Gallery on the root route'` test now passes against the updated assertion; `src/gallery/GalleryPage.test.tsx` passes unchanged (it doesn't assert on the heading text or the grid's CSS classes).

- [ ] **Step 4: Manual check**

Run: `npm run dev`, open `/`, and confirm: the page heading reads "Gallery" (not "Makespan"), and resizing the browser window wider shows the card grids progressing 1 → 2 → 3 → 4 columns and then holding at 4 columns beyond the `xl` breakpoint.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/gallery/GalleryPage.tsx frontend/src/AppRoutes.test.tsx
git commit -m "feat: widen Gallery, add responsive card grid, rename heading to Gallery"
```

---

### Task 5: Widen Solve page

**Files:**
- Modify: `frontend/src/solve/SolvePage.tsx`

**Interfaces:**
- Consumes: `--content-max-width` token (Task 1) via `max-w-(--content-max-width)`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Update `SolvePage.tsx`**

Line 18:

```tsx
// Before
    <main className="mx-auto max-w-4xl space-y-6 p-8">
// After
    <main className="mx-auto max-w-(--content-max-width) space-y-6 p-8">
```

No other changes — `GanttChart`'s `<svg>` already scales responsively via `viewBox` + `className="w-full"` (confirmed by reading `GanttChart.tsx` during planning), so widening the container alone makes the whole chart bigger, with no `solve/` internals to touch. This is a real but partial legibility improvement — row height and bar width still scale together, proportionally, because both come from the same `viewBox` coordinate system (see Global Constraints: Gantt-internal responsive decoupling is out of scope for this plan).

- [ ] **Step 2: Run the tests**

Run: `npm test`
Expected: PASS. `src/solve/SolvePage.test.tsx` renders `SolvePage` directly via its own `createMemoryRouter` (not through `AppRoutes`/`AppShell`) and doesn't assert on the `<main>` element's CSS classes, so it's unaffected.

- [ ] **Step 3: Manual check**

Run: `npm run dev`, open a completed solve's Solve page, and confirm the Gantt chart now renders visibly wider/taller than before, filling more of the available window.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/solve/SolvePage.tsx
git commit -m "feat: widen Solve page content area"
```

---

### Task 6: Final CI gate check

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Run the full frontend CI gate locally**

Run, in order, from `frontend/`:

```bash
npm run lint
npm test
npm run build
npm run check-types-fresh
```

Expected: all four succeed. These are exactly the checks `.github/workflows/ci.yml`'s `frontend` job runs — catching a failure here now is cheaper than catching it in CI.

- [ ] **Step 2: If anything fails, fix and re-run**

Fix the specific failure (lint violation, type error, failing test, or build error) and re-run the full sequence from Step 1 until all four pass. Do not skip a check to "fix later."

No commit for this task — it's a verification gate over the commits already made in Tasks 1–5. If Step 2 required fixes, amend those fixes into the relevant task's commit history via a normal follow-up commit (not `--amend`) rather than leaving the gate red.
