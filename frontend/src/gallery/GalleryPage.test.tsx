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
      vi.fn((request: Request) =>
        Promise.resolve(
          request.url.includes('/api/presets') ? jsonResponse([preset]) : jsonResponse([saved]),
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
