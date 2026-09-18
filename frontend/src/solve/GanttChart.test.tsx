import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { GanttChart } from './GanttChart'

const schedule = [
  { job_index: 0, operation_index: 0, machine_id: 'M1', start: 0, end: 5 },
  { job_index: 1, operation_index: 0, machine_id: 'M2', start: 0, end: 3 },
  { job_index: 0, operation_index: 1, machine_id: 'M2', start: 5, end: 8 },
]

describe('GanttChart', () => {
  it('renders one bar per scheduled operation', () => {
    render(<GanttChart schedule={schedule} machines={['M1', 'M2']} />)
    expect(screen.getByTestId('gantt-bar-0-0')).toBeInTheDocument()
    expect(screen.getByTestId('gantt-bar-1-0')).toBeInTheDocument()
    expect(screen.getByTestId('gantt-bar-0-1')).toBeInTheDocument()
  })

  it('renders a row label for every machine, including one with no scheduled operations', () => {
    render(<GanttChart schedule={schedule} machines={['M1', 'M2', 'M3']} />)
    expect(screen.getByText('M3')).toBeInTheDocument()
  })

  it('dims other jobs while hovering one operation', async () => {
    const user = userEvent.setup()
    render(<GanttChart schedule={schedule} machines={['M1', 'M2']} />)

    await user.hover(screen.getByTestId('gantt-bar-0-0'))

    expect(screen.getByTestId('gantt-bar-0-0')).toHaveAttribute('opacity', '1')
    expect(screen.getByTestId('gantt-bar-0-1')).toHaveAttribute('opacity', '1')
    expect(screen.getByTestId('gantt-bar-1-0')).toHaveAttribute('opacity', '0.35')
  })

  it('pins a highlight on click that survives the mouse leaving', async () => {
    const user = userEvent.setup()
    render(<GanttChart schedule={schedule} machines={['M1', 'M2']} />)

    await user.click(screen.getByTestId('gantt-bar-0-0'))
    await user.unhover(screen.getByTestId('gantt-bar-0-0'))

    expect(screen.getByTestId('gantt-bar-0-1')).toHaveAttribute('opacity', '1')
    expect(screen.getByTestId('gantt-bar-1-0')).toHaveAttribute('opacity', '0.35')
  })

  it('unpins when the same bar is clicked again', async () => {
    const user = userEvent.setup()
    render(<GanttChart schedule={schedule} machines={['M1', 'M2']} />)

    await user.click(screen.getByTestId('gantt-bar-0-0'))
    await user.click(screen.getByTestId('gantt-bar-0-0'))

    expect(screen.getByTestId('gantt-bar-1-0')).toHaveAttribute('opacity', '1')
  })

  it('renders a tooltip with the 1-based job/operation numbers, machine id, and start-end range', () => {
    render(<GanttChart schedule={schedule} machines={['M1', 'M2']} />)

    expect(screen.getByTestId('gantt-bar-0-1')).toHaveTextContent(
      'Job 1, operation 2 on M2: 5–8',
    )
  })

  it('uses a provided job name in the tooltip instead of "Job N"', () => {
    render(
      <GanttChart
        schedule={schedule}
        machines={['M1', 'M2']}
        jobNames={['Rush order', undefined]}
      />,
    )

    expect(screen.getByTestId('gantt-bar-0-1')).toHaveTextContent(
      'Rush order, operation 2 on M2: 5–8',
    )
    expect(screen.getByTestId('gantt-bar-1-0')).toHaveTextContent(
      'Job 2, operation 1 on M2: 0–3',
    )
  })

  it('falls back to "Job N" when a job name is an empty or whitespace-only string', () => {
    render(
      <GanttChart
        schedule={schedule}
        machines={['M1', 'M2']}
        jobNames={['', '   ']}
      />,
    )

    expect(screen.getByTestId('gantt-bar-0-1')).toHaveTextContent(
      'Job 1, operation 2 on M2: 5–8',
    )
    expect(screen.getByTestId('gantt-bar-1-0')).toHaveTextContent(
      'Job 2, operation 1 on M2: 0–3',
    )
  })

  it('clamps the plot width to MIN_PLOT_WIDTH when the container reports zero width (jsdom default)', () => {
    render(<GanttChart schedule={schedule} machines={['M1', 'M2']} />)

    const svg = screen.getByRole('img', { name: 'Solve schedule Gantt chart' })
    const viewBox = svg.getAttribute('viewBox')
    // width = LEFT_MARGIN (120) + MIN_PLOT_WIDTH (300) + RIGHT_MARGIN (20) = 440
    expect(viewBox).toMatch(/^0 0 440 /)
  })
})
