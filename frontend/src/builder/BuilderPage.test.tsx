import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BuilderPage } from './BuilderPage'

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/problems/new', element: <BuilderPage /> },
      { path: '/problems/:id', element: <BuilderPage /> },
    ],
    { initialEntries: [path] },
  )
  return render(<RouterProvider router={router} />, { wrapper })
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('BuilderPage', () => {
  it('starts with an empty draft on /problems/new', () => {
    renderAt('/problems/new')
    expect(screen.getByLabelText('Problem name')).toHaveValue('')
  })

  it('shows a loading state, then the hydrated draft, on /problems/:id', async () => {
    const problem = {
      id: 'abc',
      name: 'Loaded Problem',
      created_at: '2026-01-01T00:00:00Z',
      machines: ['M1'],
      jobs: [{ operations: [{ machine_id: 'M1', duration: 1 }] }],
      constraints: {},
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(problem)))

    renderAt('/problems/abc')

    expect(screen.getByText(/loading/i)).toBeInTheDocument()
    expect(await screen.findByLabelText('Problem name')).toHaveValue('Loaded Problem')
  })

  it('shows an error with retry when loading an existing problem fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ detail: 'boom' }, 500)))

    renderAt('/problems/abc')

    expect(await screen.findByText(/couldn't load/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('POSTs a new problem and navigates to /problems/:id on save', async () => {
    const user = userEvent.setup()
    const created = {
      id: 'new-id',
      name: 'M1',
      created_at: '2026-01-01T00:00:00Z',
      machines: ['M1'],
      jobs: [{ operations: [{ machine_id: '', duration: 1 }] }],
      constraints: {},
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(created, 201)))

    renderAt('/problems/new')
    await user.type(screen.getByLabelText('Machine name'), 'M1')
    await user.selectOptions(screen.getByLabelText('Machine'), 'M1')
    await user.click(screen.getByText('Save'))

    await waitFor(() => expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(0))
    const [request] = vi.mocked(fetch).mock.calls[0]
    expect((request as Request).method).toBe('POST')
  })

  it('PUTs an update in place on save for an existing problem', async () => {
    const user = userEvent.setup()
    const problem = {
      id: 'abc',
      name: 'Demo',
      created_at: '2026-01-01T00:00:00Z',
      machines: ['M1'],
      jobs: [{ operations: [{ machine_id: 'M1', duration: 1 }] }],
      constraints: {},
    }
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(problem))))

    renderAt('/problems/abc')
    await screen.findByLabelText('Problem name')
    await user.click(screen.getByText('Save'))

    await waitFor(() =>
      expect(
        vi.mocked(fetch).mock.calls.some(([req]) => (req as Request).method === 'PUT'),
      ).toBe(true),
    )
    expect(await screen.findByLabelText('Problem name')).toBeInTheDocument()
  })
})
