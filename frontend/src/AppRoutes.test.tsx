import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { AppRoutes } from './AppRoutes'

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('AppRoutes', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

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
  })
})
