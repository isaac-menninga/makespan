import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { routes } from './AppRoutes'

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  return render(<RouterProvider router={router} />, { wrapper })
}

describe('routes', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the Builder on the new-problem route', () => {
    renderAt('/problems/new')
    expect(screen.getByLabelText('Problem name')).toBeInTheDocument()
  })

  it('renders a loading state on an existing-problem route', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    renderAt('/problems/abc-123')
    expect(await screen.findByText(/loading/i)).toBeInTheDocument()
  })

  it('renders the Gallery on the root route', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    renderAt('/')
    expect(screen.getByRole('heading', { name: 'Makespan' })).toBeInTheDocument()
  })

  it('renders the Solve view on the solve route', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    renderAt('/problems/abc/solves/xyz')
    expect(await screen.findByText(/loading/i)).toBeInTheDocument()
  })
})
