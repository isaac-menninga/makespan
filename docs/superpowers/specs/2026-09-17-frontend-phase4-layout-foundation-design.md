# Frontend Phase 4 — Layout Foundation — Design

**Date**: 2026-09-17
**Status**: Approved for implementation planning

## Purpose

Replace the app's current per-page, independently-centered layout (each of
Gallery/Builder/Solve renders its own isolated `<main className="mx-auto
max-w-Nxl p-8">`, with no shared container, no persistent navigation) with a
shared layout foundation: a persistent left-aligned navigation rail plus
page-appropriate content widths that make real use of the available window,
instead of a narrow centered-document layout. The concrete trigger was the
Solve view's Gantt chart being cramped inside a `max-w-4xl` column, but the
fix is a real shared foundation other pages adopt too, not a one-off width
bump on a single page.

Reference point discussed and agreed: apps like Google Sheets or Canva —
content fills the window and responds to resizing, rather than living in a
fixed-width centered card. This phase establishes that foundation; it does
not chase full feature parity with either reference.

## Relationship to other frontend work

1. **Phases 1–3 (shipped)**: Gallery, Builder, Solve view — each an
   independent, narrow, centered page with no shared layout component.
2. **Phase 4 (this spec)**: shared layout foundation — a persistent nav
   rail, page-appropriate soft-max widths, a wider responsive Gallery grid,
   and a wider Solve view.
3. **Bookmarked, explicitly separate future effort**: a dedicated redesign
   of the Builder's own create/edit UX (it currently reads as form-heavy;
   the intent discussed is a more dedicated, power-user-oriented
   create/edit experience). Out of scope here — Builder is wrapped by the
   new shell in this phase but its internal layout is untouched.
4. **Deferred, tentative future phase**: job naming (no `Job.name` field
   exists anywhere in the system today — backend model, Builder, or Gantt)
   and Gantt-internal responsive sizing (decoupling the chart's width from
   its row height, rather than relying on uniform SVG `viewBox` scaling).
   This phase makes the Gantt visibly bigger as a side effect of the wider
   content area, but the real legibility fix is that later phase's job —
   see "Known partial improvement" below.

No backend changes.

## Scope decisions

- **Left-aligned persistent nav rail**, not a top header bar — chosen over
  the initially-proposed thin top bar based on a Canva-style reference.
- **Nav rail content: branding/home link only**, nothing else. No richer
  nav (no saved-problems shortcuts, no icons, no collapse/expand state) —
  deliberately minimal since there's currently only one real top-level
  destination (the Gallery) to link to.
- **Soft-max content width: 1600px**, for data-dense pages (Gallery,
  Solve) only.
- **Gallery grid**: fixed breakpoint columns — 1 → 2 → 3 → 4 — capped at 4
  regardless of viewport width beyond the `xl` breakpoint. Chosen
  explicitly over an uncapped `auto-fill`/`minmax()` grid (which has no
  natural ceiling and would keep adding columns on very wide monitors).
- **Builder is wrapped by the shell, not redesigned.** It gets the nav
  rail like every other page, but its internal layout — the existing
  narrow single-column form — is completely unchanged: same width, same
  structure, no reflow. Its real redesign is the bookmarked future effort
  named above.
- **Mobile/narrow-viewport nav collapse is bookmarked, not built now.**
  The rail stays a fixed width at all viewport sizes in this phase. This
  app is framed as power-user/desktop oriented for now, but better
  small-screen support (e.g. a collapsing/hamburger nav) is a reasonable
  future direction, not a closed door — just not part of this phase.
- **The nav rail is not sticky/pinned.** It scrolls with the page in
  normal document flow, rather than staying fixed in the viewport while
  content scrolls beneath it. Simpler, and consistent with "branding only"
  — a persistently-pinned nav is a reasonable future upgrade once the rail
  has more in it worth keeping visible.

## Known partial improvement (Gantt chart)

`GanttChart`'s `<svg>` already scales responsively via `viewBox` +
`className="w-full"` — so simply widening the Solve page's container makes
the whole chart visibly bigger for free, no `solve/` code changes needed in
this phase. But that scaling is **uniform**: row height and bar width grow
together, proportionally, because both are expressed in the same internal
coordinate system. For a schedule with many machines, that could make the
chart awkwardly tall rather than just more legible. The actual fix —
letting chart width respond to real container width while keeping row
height under independent control (measuring actual rendered width via a
`ResizeObserver`, rather than relying on proportional `viewBox` scaling) —
is Gantt-internal work, explicitly deferred to the future phase alongside
job naming. This phase's contribution to Gantt legibility is real but
partial; expectations should be set accordingly.

## Technical design

### Routing restructure — a shared layout route

`frontend/src/AppRoutes.tsx` currently exports a flat `routes: RouteObject[]`
with four top-level entries. React Router's idiomatic mechanism for shared
chrome across routes is a parent **layout route** — a route with no `path`,
rendering shared UI plus an `<Outlet />`, with the real routes nested as its
`children`. This is a routing-structure change only; every existing route's
`path`/`element` stays exactly as it is today, just nested one level deeper:

```tsx
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

`createMemoryRouter`/`createBrowserRouter` both resolve nested routes
transparently — a test rendering at a given path still matches into the
correct child and renders the full tree (layout route + matched child),
with no change needed to how individual pages are path-tested.

### `AppShell` component

New file, `frontend/src/AppShell.tsx`:

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

`w-48` (192px) is wide enough for the "Makespan" wordmark comfortably at a
normal heading size, without needing an icon-only-rail-plus-hover-expand
pattern that richer nav content would eventually justify — not needed for
branding-only content. `min-w-0` on the content wrapper prevents the flex
item from refusing to shrink below its content's intrinsic width (a common
flexbox gotcha that would otherwise let a wide child, like the Gantt SVG,
force horizontal overflow of the whole shell).

### Shared content-width token

`frontend/src/index.css` already defines one custom design token
(`--color-accent`). Adding a second, for the shared soft-max width, keeps
Gallery and Solve pointing at one source of truth rather than repeating a
magic number in two files:

```css
@theme {
  --color-accent: #4f46e5;
  --content-max-width: 1600px;
}
```

Referenced via Tailwind v4's arbitrary-value-from-custom-property syntax:
`max-w-(--content-max-width)`.

### Per-page changes

- **`frontend/src/gallery/GalleryPage.tsx`**:
  - `<main className="mx-auto max-w-4xl p-8">` → `<main className="mx-auto max-w-(--content-max-width) p-8">`.
  - Both card grids (`Presets`, `Your Problems`) change from
    `grid gap-4 sm:grid-cols-2` to
    `grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`.
  - The page's own `<h1>Makespan</h1>` is renamed to `<h1>Gallery</h1>` —
    now that "Makespan" is the persistent nav's branding, repeating the
    app name as the page heading too is redundant on screen. (This also
    means `AppRoutes.test.tsx`'s existing
    `screen.getByRole('heading', { name: 'Makespan' })` assertion needs
    updating to `'Gallery'` — a deliberate, expected test change, not a
    regression.)

- **`frontend/src/solve/SolvePage.tsx`**:
  - `<main className="mx-auto max-w-4xl space-y-6 p-8">` → `<main className="mx-auto max-w-(--content-max-width) space-y-6 p-8">`.
  - No other changes — the Gantt's own responsive scaling (see "Known
    partial improvement" above) does the rest for this phase.

- **`frontend/src/builder/BuilderForm.tsx`**: **no changes.** Still
  `<main className="mx-auto max-w-3xl space-y-6 p-8">`, unchanged. It
  simply now renders inside `AppShell`'s content area instead of directly
  in the document body — visually, it now sits to the right of the nav
  rail instead of being the only thing on the page, but nothing about its
  own markup, width, or structure changes.

## Testing

- New `AppShell.test.tsx`: renders `AppShell` with a simple child route via
  `createMemoryRouter`/`RouterProvider` (matching this codebase's
  established data-router test pattern), asserts the "Makespan" link is
  present with `href="/"`, and that the child route's content renders via
  the `Outlet`.
- `AppRoutes.test.tsx`: update the existing root-route test's heading
  assertion from `'Makespan'` to `'Gallery'` (the only test file with this
  assertion — confirmed by search; `GalleryPage.test.tsx` does not assert
  on this heading text today, so it needs no change here). Existing
  route-matching tests otherwise need no structural changes, since nesting
  is transparent to `createMemoryRouter`.
- No new tests needed for `GalleryPage.tsx`/`SolvePage.tsx`/`BuilderForm.tsx` beyond what
  already exists — neither's own test-relevant behavior changes, only
  their rendered width (not something the existing tests assert on, nor
  worth asserting on given it's a CSS class, not behavior).

## Out of scope for Phase 4

- Builder's own create/edit UX redesign (bookmarked, separate future
  effort per the "Relationship to other frontend work" section above).
- Gantt-internal responsive width/row-height decoupling (deferred to the
  same future phase as job naming).
- Richer left-nav content: saved-problem shortcuts, icons, a
  collapsed/expanded state, or any nav content beyond branding.
- Mobile/narrow-viewport nav collapse — bookmarked, not closed. The rail
  stays fixed-width at every viewport size in this phase; the app is
  desktop/power-user-oriented for now, but better small-screen support is
  a reasonable direction to pick up later.
- A sticky/pinned nav rail that stays visible while content scrolls — the
  rail scrolls with the page in normal document flow.
- Dark mode (standing constraint from Phase 1, unchanged).
