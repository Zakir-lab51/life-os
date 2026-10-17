"use client"

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { ChartTooltip, axisProps, useChartMotion } from "@/components/os/chart"
import { formatDay } from "@/lib/domain/dates"

/* Focus minutes for the last seven days; loaded after the Focus page draws, so the timer never waits for the charts library. */
export function WeekChart({ week }: { week: { date: string; label: string; minutes: number }[] }) {
  const chartMotion = useChartMotion()
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={week} margin={{ top: 8, right: 4, bottom: 0, left: -4 }} barCategoryGap="24%">
        <CartesianGrid vertical={false} stroke="var(--line)" />
        <XAxis dataKey="label" {...axisProps} interval={0} />
        <YAxis {...axisProps} width={44} allowDecimals={false} />
        <Tooltip cursor={{ fill: "var(--surface-3)", opacity: 0.5 }} content={<ChartTooltip format={(v) => `${v} min`} labelFormat={(_, p) => formatDay(String(p?.date), "EEEE d MMM")} />} />
        <Bar {...chartMotion} dataKey="minutes" name="Focus" fill="var(--violet)" radius={[4, 4, 0, 0]} maxBarSize={24} />
      </BarChart>
    </ResponsiveContainer>
  )
}
