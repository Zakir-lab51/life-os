"use client"

import { ChartColumn, Table2 } from "lucide-react"
import { useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"

export interface ChartTable {
  columns: string[]
  rows: (string | number)[][]
}

/**
 * Card chrome shared by every chart: title, optional legend, and a Table view
 * with the same numbers, so no value is ever only reachable by hovering.
 */
export function ChartFrame({
  title,
  subtitle,
  table,
  legend,
  children,
  className,
  bare = false,
}: {
  title: ReactNode
  subtitle?: ReactNode
  table: ChartTable
  legend?: ReactNode
  children: ReactNode
  className?: string
  /** Render without the glass card (when nested in another panel). */
  bare?: boolean
}) {
  const [view, setView] = useState<"chart" | "table">("chart")
  return (
    <section className={cn(!bare && "glass rounded-panel p-5 sm:p-6", "flex flex-col", className)}>
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[1.05rem] leading-tight font-semibold tracking-tight">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 rounded-full border border-line p-0.5" role="group" aria-label="View as">
          <button
            type="button"
            aria-pressed={view === "chart"}
            aria-label="Chart view"
            onClick={() => setView("chart")}
            className={cn("grid size-7 place-items-center rounded-full transition-colors", view === "chart" ? "bg-surface-3 text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            <ChartColumn className="size-3.5" />
          </button>
          <button
            type="button"
            aria-pressed={view === "table"}
            aria-label="Table view"
            onClick={() => setView("table")}
            className={cn("grid size-7 place-items-center rounded-full transition-colors", view === "table" ? "bg-surface-3 text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            <Table2 className="size-3.5" />
          </button>
        </div>
      </header>
      {legend && view === "chart" && <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">{legend}</div>}
      {view === "chart" ? (
        children
      ) : (
        <div className="max-h-72 overflow-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-2 text-xs text-muted-foreground">
              <tr>
                {table.columns.map((c, i) => (
                  <th key={c} scope="col" className={cn("px-3 py-2 font-medium", i === 0 ? "text-left" : "text-right")}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i} className="border-t border-line">
                  {r.map((cell, j) => (
                    <td key={j} className={cn("px-3 py-1.5", j === 0 ? "text-left" : "text-right tabular")}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export function LegendItem({ color, label, kind = "box" }: { color: string; label: string; kind?: "box" | "line" }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={kind === "line" ? "h-0.5 w-3 rounded-full" : "size-2.5 rounded-[3px]"} style={{ background: color }} />
      {label}
    </span>
  )
}

interface TooltipEntry {
  name?: string | number
  value?: number | string | null
  color?: string
  dataKey?: string | number
  payload?: Record<string, unknown>
}

/** Recharts tooltip body: values lead (strong), series names follow, keyed with a short line. */
export function ChartTooltip({
  active,
  payload,
  label,
  format = (v) => String(v),
  labelFormat,
}: {
  active?: boolean
  payload?: TooltipEntry[]
  label?: string | number
  format?: (v: number, key: string) => string
  labelFormat?: (label: string | number, payload?: Record<string, unknown>) => string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="min-w-36 rounded-2xl border border-line bg-popover/95 px-3 py-2.5 text-xs shadow-xl backdrop-blur-xl">
      <div className="mb-1.5 text-muted-foreground">{labelFormat ? labelFormat(label ?? "", payload[0]?.payload) : label}</div>
      <div className="space-y-1">
        {payload.map((p) => (
          <div key={String(p.dataKey)} className="flex items-center gap-2">
            <span className="h-0.5 w-3 rounded-full" style={{ background: p.color }} />
            <span className="font-semibold text-foreground tabular">{p.value === null || p.value === undefined ? "–" : format(Number(p.value), String(p.dataKey))}</span>
            <span className="text-muted-foreground">{p.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Shared axis styling: recessive, muted text, no axis lines. */
export const axisProps = {
  tick: { fill: "var(--muted-foreground)", fontSize: 11 },
  axisLine: false,
  tickLine: false,
} as const
