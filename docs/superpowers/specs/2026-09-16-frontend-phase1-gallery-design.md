# Frontend Phase 1 — Scaffold, API Client, Gallery — Design

**Date**: 2026-09-16
**Status**: Approved for implementation planning

## Purpose

Stand up the frontend project described in `docs/superpowers/specs/2026-09-09-job-shop-scheduler-design.md` ("Frontend Design" section) and deliver the first working page: the Gallery. No `frontend/` directory exists yet, so this covers scaffolding from scratch through a deployable, if minimal, app.

## Relationship to the overall frontend

The frontend is built in three phases, each independently planned and shipped:

1. **Phase 1 (this spec)**: scaffold + typed API client + Gallery page.
2. **Phase 2**: Builder — the jobs/machines/operations editor at `/problems/:id` and `/problems/new`.
3. **Phase 3**: Solve view — live progress + custom SVG Gantt chart at `/problems/:id/solves/:solveId`.

Phase 1 creates route placeholders for `/problems/:id` and `/problems/new` so the Gallery has somewhere to navigate to; Phase 2 fills those in without touching the Gallery.

## Backend change (prerequisite)

`GET /api/problems` currently returns every `ProblemRecord`, including presets (presets are ordinary `Problem` rows with fixed IDs — see `src/makespan/db/seed.py:11`, `PRESET_IDS`). The Gallery needs "presets" and "your problems" as distinct sets, so:

In `src/makespan/api/problems.py`, `list_problems` changes from:
```python
records = session.exec(select(ProblemRecord)).all()
```
to:
```python
records = session.exec(
    select(ProblemRecord).where(ProblemRecord.id.notin_(PRESET_IDS))
).all()
```
(`PRESET_IDS` imported from `makespan.db.seed`.)

Scope: only the list endpoint changes. `GET /api/problems/{id}` and `PUT /api/problems/{id}` are untouched — presets remain individually fetchable/editable by ID, matching the existing design ("presets are just seeded Problem rows, not a separate mechanism"). Add a test asserting a preset ID is absent from `GET /api/problems`'s response; the existing `test_list_problems` needs no change.

## Structure

```
frontend/
├── src/
│   ├── api/          # generated OpenAPI types + typed fetch client
│   ├── gallery/       # Gallery page + card components
│   ├── App.tsx        # React Router setup (Gallery + stub routes)
│   └── main.tsx
├── index.html
├── vite.config.ts     # dev server + /api proxy to localhost:8000
├── tailwind.config.ts
├── package.json
└── ...
```

## Tooling

- **Vite + React + TypeScript** (strict mode), **npm** as package manager.
- **Tailwind CSS** for styling, with theme tokens (see Visual design) rather than ad hoc hardcoded colors.
- **React Router**: routes for `/` (Gallery), `/problems/new`, `/problems/:id` (the latter two render a "coming in Phase 2" placeholder for now).
- **TanStack Query** for data fetching, used for `GET /api/presets` and `GET /api/problems`. Establishes the query-key/fetch pattern Phase 2/3 reuse (including polling in Phase 3 via `refetchInterval`).
- **ESLint + Prettier** configured from the start.
- **Vitest + React Testing Library** configured from the start, with a real test covering the Gallery page (loading, populated, empty, error states) so the harness exists before Phase 2/3 need heavier component tests (Builder, Gantt).
- **Type generation**: `npm run generate-types` runs `openapi-typescript` against `http://localhost:8000/openapi.json`, writing `src/api/schema.ts`. Requires the backend running locally when regenerating types — a dev-time step, not a build dependency, and keeps frontend types from drifting from the Pydantic schemas.
- **Dev workflow**: `vite dev` runs the frontend on its own port with `vite.config.ts` proxying `/api/*` to `http://localhost:8000` (FastAPI, run separately via `uv run uvicorn`). Gives HMR during frontend work. Production still builds via `vite build` and is served by FastAPI from `dist/`, per the original design doc — unchanged by this phase.

## Visual design (light pass)

Not a full design system — enough to make Phase 1 look intentional, revisited later once all three pages exist.

- **Palette**: Tailwind's `slate` scale for surfaces/text/borders; `indigo-600` as the single accent color for primary actions, links, and active states. Light mode only — dark mode is out of scope.
- **Typography**: Tailwind's default system sans stack (`font-sans`). No custom webfont, to avoid a font-loading decision and keep the bundle small.
- These are defined as Tailwind theme tokens (e.g. `colors.accent`) rather than scattered utility classes, so Phase 2/3 reuse them and a later dedicated design pass has one place to change values.

## Gallery page (`/`)

- Two sections, each backed by its own query: **Presets** (`GET /api/presets`) and **Your Problems** (`GET /api/problems`, now preset-free per the backend change above).
- **Card content**: name, machine count, job count. Preset cards show their built-in descriptive name (e.g. "FT06 (6x6 benchmark, optimal makespan 55)"); saved-problem cards show name + relative `created_at` (e.g. "2 days ago").
- **Navigation**: clicking any card (preset or saved) navigates to `/problems/:id` — one consistent path, matching the overall design doc's edit-in-place model for problems (including presets). In Phase 1 this route is a placeholder; Phase 2 replaces the placeholder with the real Builder, no Gallery changes required.
- A **"New Problem"** card/button navigates to `/problems/new` (same placeholder treatment in Phase 1).
- **Loading state**: skeleton cards while either query is in flight.
- **Error state**: inline message with a retry action if either fetch fails.
- **Empty state**: when "Your Problems" is empty, a short prompt pointing at "New Problem" (Presets is never empty — it's always seeded).

## Testing

- **Backend**: one new test for the `list_problems` preset-exclusion fix (see above).
- **Frontend** (Vitest + RTL): Gallery page rendering for loading/populated/empty/error states; a card click triggers the expected navigation.
- **Manual smoke check**: `npm run dev` + `uv run uvicorn` together, confirm presets and any saved problems render as separate sections and cards navigate to the placeholder route.

## Out of scope for Phase 1

- The Builder (Phase 2) and Solve view / Gantt chart (Phase 3) — only route placeholders exist.
- Dark mode, custom typography, or any deeper visual design pass.
- Deployment/Docker changes — the existing "FastAPI serves `dist/` in prod" model from the original design doc is unchanged.
