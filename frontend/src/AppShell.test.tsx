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
