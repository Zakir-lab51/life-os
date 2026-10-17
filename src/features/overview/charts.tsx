"use client"

import { Bar, BarChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts"
import { ChartTooltip, axisProps, useChartMotion } from "@/components/os/chart"
import { formatDay } from "@/lib/domain/dates"
import type { RadarValue } from "@/lib/domain/scores"

/*
  The two charts on Overview, apart from the widgets so the charts library (about 340 KB)
  loads after Overview has drawn instead of before (widgets.tsx loads these on demand).
*/

export function LifeRadar({ values, data }: { values: RadarValue[]; data: { label: string; axis: string; value: number; raw: number | null }[] }) {
  const chartMotion = useChartMotion()
  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadarChart data={data} outerRadius="64%" margin={{ top: 6, right: 30, bottom: 6, left: 30 }}>
        <PolarGrid stroke="var(--line)" />
        <PolarAngleAxis dataKey="axis" tick={{ fill: "var(--muted-foreground)", fontSize: 10.5 }} />
        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
        <Radar {...chartMotion} dataKey="value" name="Score" stroke="var(--violet)" strokeWidth={2} fill="var(--violet)" fillOpacity={0.15} dot={{ r: 3, fill: "var(--violet)", strokeWidth: 0 }} />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const p = payload[0].payload as { label: string; raw: number | null }
            const v = values.find((x) => x.label === p.label)
            return (
              <div className="max-w-56 rounded-2xl border border-line bg-popover/95 px-3 py-2.5 text-xs shadow-xl backdrop-blur-xl">
                <div className="font-semibold text-foreground">{p.raw === null ? "Not tracked yet" : `${p.raw} / 100`}</div>
                <div className="text-muted-foreground">{p.label}</div>
                {v && <div className="mt-1 text-muted-foreground">{v.detail || v.how}</div>}
              </div>
            )
          }}
        />
      </RadarChart>
    </ResponsiveContainer>
  )
}

export function FocusWeek({ week }: { week: { date: string; label: string; minutes: number }[] }) {
  const chartMotion = useChartMotion()
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={week} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap="22%">
        <XAxis dataKey="label" {...axisProps} interval={0} height={16} />
        <Tooltip cursor={{ fill: "var(--surface-3)", opacity: 0.5 }} content={<ChartTooltip format={(v) => `${v} min`} labelFormat={(_, p) => formatDay(String(p?.date))} />} />
        <Bar {...chartMotion} dataKey="minutes" name="Focus" fill="var(--cyan)" radius={[4, 4, 0, 0]} maxBarSize={24} />
      </BarChart>
    </ResponsiveContainer>
  )
}
