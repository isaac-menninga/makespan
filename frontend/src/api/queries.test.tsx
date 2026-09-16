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
    const [request] = vi.mocked(fetch).mock.calls[0]
    expect((request as Request).url).toContain('/api/presets')
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
    const [request] = vi.mocked(fetch).mock.calls[0]
    expect((request as Request).url).toContain('/api/problems')
  })
})
