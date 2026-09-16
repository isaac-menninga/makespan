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
