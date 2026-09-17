import type { GanttBarLayout } from './layout'

type GanttBarProps = {
  bar: GanttBarLayout
  x: number
  y: number
  width: number
  height: number
  color: string
  isDimmed: boolean
  onHover: (jobIndex: number | null) => void
  onToggle: (jobIndex: number) => void
}

export function GanttBar({
  bar,
  x,
  y,
  width,
  height,
  color,
  isDimmed,
  onHover,
  onToggle,
}: GanttBarProps) {
  return (
    <rect
      data-testid={`gantt-bar-${bar.jobIndex}-${bar.operationIndex}`}
      x={x}
      y={y}
      width={width}
      height={height}
      rx={4}
      fill={color}
      opacity={isDimmed ? 0.35 : 1}
      style={{ cursor: 'pointer' }}
      onMouseEnter={() => onHover(bar.jobIndex)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onToggle(bar.jobIndex)}
    >
      <title>
        {`Job ${bar.jobIndex + 1}, operation ${bar.operationIndex + 1} on ${bar.machineId}: ${bar.start}–${bar.end}`}
      </title>
    </rect>
  )
}
