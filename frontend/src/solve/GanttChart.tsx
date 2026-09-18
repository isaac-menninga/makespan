import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { computeGanttLayout, type ScheduledOperationApi } from './layout'
import { GanttBar } from './GanttBar'

// The dataviz skill's validated default categorical palette (light mode),
// used unmodified, in its fixed order. See Global Constraints in the plan
// for why colors cycle past 8 jobs instead of growing a legend.
const CATEGORICAL_COLORS = [
  '#2a78d6', // blue
  '#eb6834', // orange
  '#1baf7a', // aqua
  '#eda100', // yellow
  '#e87ba4', // magenta
  '#008300', // green
  '#4a3aa7', // violet
  '#e34948', // red
]

const ROW_HEIGHT = 48
const BAR_INSET_Y = 8
const BAR_GAP_X = 2
const LEFT_MARGIN = 120
const RIGHT_MARGIN = 20
const TOP_MARGIN = 24
const BOTTOM_MARGIN = 24
const MIN_PLOT_WIDTH = 300
const AXIS_TICKS = [0, 0.25, 0.5, 0.75, 1]

function colorForJob(jobIndex: number): string {
  return CATEGORICAL_COLORS[jobIndex % CATEGORICAL_COLORS.length]
}

function useContainerWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null)
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    if (!ref.current) return
    setWidth(ref.current.getBoundingClientRect().width)

    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width)
    })
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  return [ref, width]
}

type GanttChartProps = {
  schedule: ScheduledOperationApi[]
  machines: string[]
  jobNames?: (string | undefined)[]
}

export function GanttChart({ schedule, machines, jobNames }: GanttChartProps) {
  const [hoveredJob, setHoveredJob] = useState<number | null>(null)
  const [pinnedJob, setPinnedJob] = useState<number | null>(null)
  const highlightedJob = pinnedJob ?? hoveredJob
  const [containerRef, containerWidth] = useContainerWidth<HTMLDivElement>()

  const layout = computeGanttLayout(schedule, machines)
  const makespan = Math.max(1, ...schedule.map((operation) => operation.end))
  const plotHeight = machines.length * ROW_HEIGHT
  const height = TOP_MARGIN + plotHeight + BOTTOM_MARGIN
  const PLOT_WIDTH = Math.max(MIN_PLOT_WIDTH, containerWidth - LEFT_MARGIN - RIGHT_MARGIN)
  const width = LEFT_MARGIN + PLOT_WIDTH + RIGHT_MARGIN

  return (
    <div ref={containerRef}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Solve schedule Gantt chart"
        style={{ height }}
        className="w-full"
      >
        {machines.map((machineId, rowIndex) => (
          <text
            key={machineId}
            x={LEFT_MARGIN - 8}
            y={TOP_MARGIN + rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2}
            textAnchor="end"
            dominantBaseline="middle"
            className="fill-slate-600 text-xs"
          >
            {machineId}
          </text>
        ))}

        {AXIS_TICKS.map((fraction) => (
          <g key={fraction}>
            <line
              x1={LEFT_MARGIN + fraction * PLOT_WIDTH}
              x2={LEFT_MARGIN + fraction * PLOT_WIDTH}
              y1={TOP_MARGIN}
              y2={TOP_MARGIN + plotHeight}
              stroke="#e1e0d9"
              strokeWidth={1}
            />
            <text
              x={LEFT_MARGIN + fraction * PLOT_WIDTH}
              y={TOP_MARGIN + plotHeight + 16}
              textAnchor="middle"
              className="fill-slate-400 text-xs"
            >
              {Math.round(fraction * makespan)}
            </text>
          </g>
        ))}

        {layout.map((bar) => (
          <GanttBar
            key={`${bar.jobIndex}-${bar.operationIndex}`}
            bar={bar}
            x={LEFT_MARGIN + bar.x * PLOT_WIDTH + BAR_GAP_X / 2}
            y={TOP_MARGIN + bar.rowIndex * ROW_HEIGHT + BAR_INSET_Y}
            width={Math.max(0, bar.width * PLOT_WIDTH - BAR_GAP_X)}
            height={ROW_HEIGHT - BAR_INSET_Y * 2}
            color={colorForJob(bar.jobIndex)}
            isDimmed={highlightedJob !== null && highlightedJob !== bar.jobIndex}
            jobLabel={jobNames?.[bar.jobIndex]?.trim() || `Job ${bar.jobIndex + 1}`}
            onHover={setHoveredJob}
            onToggle={(jobIndex) => {
              if (pinnedJob === jobIndex) {
                // Unpinning: also clear hover state
                setPinnedJob(null)
                setHoveredJob(null)
              } else {
                // Pinning
                setPinnedJob(jobIndex)
              }
            }}
          />
        ))}
      </svg>
    </div>
  )
}
