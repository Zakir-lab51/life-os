"use client"

import { Activity, CalendarRange, Check, Flame, Gauge, Timer } from "lucide-react"
import { useMemo, useState } from "react"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Skeleton } from "@/components/ui/skeleton"
import { ChartFrame, ChartTooltip, axisProps, useChartMotion } from "@/components/os/chart"
import { Segmented } from "@/components/os/field"
import { Heatmap } from "@/components/os/heatmap"
import { PageHeader, PageTransition } from "@/components/os/page-header"
import { Panel } from "@/components/os/panel"
import { StatTile } from "@/components/os/visuals"
import { AREA_CHART_ORDER, AREA_META } from "@/lib/domain/areas"
import { areaBreakdown, dailySeries, previousRange, summarize, type Summary } from "@/lib/domain/analytics"
import { addDays, formatDay, formatDuration } from "@/lib/domain/dates"
import { lifeBalance } from "@/lib/domain/scores"
import { useLife, type Life } from "@/features/shell/use-life"
import { RadarWidget } from "@/features/overview/widgets"

type Range = 7 | 30 | 90

export function AnalyticsView() {
  const life = useLife()
  if (!life) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-24 rounded-panel" />
        <div className="grid gap-4 @4xl/main:grid-cols-2">
          <Skeleton className="h-80 rounded-panel" />
          <Skeleton className="h-80 rounded-panel" />
        </div>
      </div>
    )
  }
  return <Analytics life={life} />
}

function delta(cur: number | null, prev: number | null, unit: "%" | "pts" = "%") {
  if (cur === null || prev === null) return undefined
  if (unit === "pts") {
    const d = cur - prev
    return `${d >= 0 ? "+" : ""}${d} pts vs previous period`
  }
  if (prev === 0) return cur > 0 ? "up from zero" : "no change"
  const d = Math.round(((cur - prev) / prev) * 100)
  return `${d >= 0 ? "+" : ""}${d}% vs previous period`
}

function Analytics({ life }: { life: Life }) {
  const chartMotion = useChartMotion()
  const { data, today, prefs } = life
  const [range, setRange] = useState<Range>(30)
  const from = addDays(today, -(range - 1))

  const { series, summary, prev, areas, radar, heat } = useMemo(() => {
    const series = dailySeries(data, from, today, prefs)
    const summary = summarize(series, data, from, today)
    const p = previousRange(from, today)
    const prev = summarize(dailySeries(data, p.from, p.to, prefs), data, p.from, p.to)
    const areas = areaBreakdown(data, from, today)
    const radar = lifeBalance(data, today, prefs).filter((r) => prefs.radarDims.includes(r.dim))
    const heatFrom = addDays(today, -7 * 26)
    const heat = new Map(dailySeries(data, heatFrom, today, prefs).map((p) => [p.date, p.activity]))
    return { series, summary, prev, areas, radar, heat }
  }, [data, from, today, prefs])

  const maxActivity = Math.max(1, ...heat.values())
  const hasAny = summary.tasksDone + summary.focusMin > 0 || summary.habitRate !== null
  const tickInterval = range === 7 ? 0 : "preserveStartEnd"
  const label = (_: string | number, p?: Record<string, unknown>) => formatDay(String(p?.date), "EEE d MMM")

  return (
    <PageTransition>
      <PageHeader title="Analytics" description="Everything here is calculated from what you've actually recorded." />

      {/* the icon goes with the dates it labels, so it never sits alone when the row wraps on a phone */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented<Range>
          ariaLabel="Date range"
          value={range}
          onChange={setRange}
          options={[
            { value: 7, label: "Last 7 days" },
            { value: 30, label: "Last 30 days" },
            { value: 90, label: "Last 90 days" },
          ]}
        />
        <span className="flex items-center gap-1.5 text-xs text-muted-backdrop on-backdrop">
          <CalendarRange className="size-3.5" aria-hidden />
          {formatDay(from, "d MMM")} – {formatDay(today, "d MMM yyyy")}
        </span>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 @2xl/main:grid-cols-3 @6xl/main:grid-cols-6">
        <StatTile label="Tasks finished" value={summary.tasksDone} sub={delta(summary.tasksDone, prev.tasksDone)} icon={Check} tone="violet" />
        <StatTile label="Completion rate" value={summary.completionRate === null ? "–" : `${summary.completionRate}%`} sub="of finished + still-due tasks" icon={Gauge} tone="violet" />
        <StatTile label="Focus time" value={formatDuration(summary.focusMin)} sub={delta(summary.focusMin, prev.focusMin)} icon={Timer} tone="cyan" />
        <StatTile label="Habit consistency" value={summary.habitRate === null ? "–" : `${summary.habitRate}%`} sub={delta(summary.habitRate, prev.habitRate, "pts")} icon={Flame} tone="mint" />
        <StatTile label="Avg. daily score" value={summary.avgScore ?? "–"} sub={delta(summary.avgScore, prev.avgScore, "pts")} icon={Activity} tone="amber" />
        <StatTile label="Active days" value={`${summary.activeDays}/${range}`} sub="days with any activity" icon={CalendarRange} tone="blue" />
      </div>

      {!hasAny && (
        <Panel className="mb-4">
          <p className="text-sm text-muted-foreground">No activity in this range yet. Finish tasks, check in habits or run a focus session and these charts fill in automatically.</p>
        </Panel>
      )}

      <div className="grid gap-4 @4xl/main:grid-cols-2">
        <ChartFrame
          title="Productivity score"
          subtitle="Daily score from tasks, focus and habits (0–100)"
          table={{ columns: ["Day", "Score"], rows: series.map((p) => [formatDay(p.date, "EEE d MMM"), p.score ?? "–"]) }}
        >
          <ChartBox>
            <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -4 }}>
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis dataKey="label" {...axisProps} interval={tickInterval} minTickGap={24} />
              <YAxis {...axisProps} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} width={44} />
              <Tooltip cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }} content={<ChartTooltip labelFormat={label} />} />
              <Area {...chartMotion} dataKey="score" name="Score" type="monotone" stroke="var(--violet)" strokeWidth={2} fill="var(--violet)" fillOpacity={0.1} connectNulls={false} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} />
            </AreaChart>
          </ChartBox>
        </ChartFrame>

        <ChartFrame
          title="Tasks finished"
          subtitle="Per day"
          table={{ columns: ["Day", "Tasks"], rows: series.map((p) => [formatDay(p.date, "EEE d MMM"), p.tasksDone]) }}
        >
          <ChartBox>
            <BarChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -4 }} barCategoryGap="20%">
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis dataKey="label" {...axisProps} interval={tickInterval} minTickGap={24} />
              <YAxis {...axisProps} allowDecimals={false} width={44} />
              <Tooltip cursor={{ fill: "var(--surface-3)", opacity: 0.5 }} content={<ChartTooltip labelFormat={label} format={(v) => `${v} task${v === 1 ? "" : "s"}`} />} />
              <Bar {...chartMotion} dataKey="tasksDone" name="Finished" fill="var(--violet)" radius={[4, 4, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ChartBox>
        </ChartFrame>

        <ChartFrame
          title="Focus time"
          subtitle={`Minutes per day · daily target ${prefs.focus.dailyTargetMin} min`}
          table={{ columns: ["Day", "Minutes"], rows: series.map((p) => [formatDay(p.date, "EEE d MMM"), p.focusMin]) }}
        >
          <ChartBox>
            <BarChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -4 }} barCategoryGap="20%">
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis dataKey="label" {...axisProps} interval={tickInterval} minTickGap={24} />
              <YAxis {...axisProps} allowDecimals={false} width={44} />
              <Tooltip cursor={{ fill: "var(--surface-3)", opacity: 0.5 }} content={<ChartTooltip labelFormat={label} format={(v) => `${v} min`} />} />
              <Bar {...chartMotion} dataKey="focusMin" name="Focus" fill="var(--cyan)" radius={[4, 4, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ChartBox>
        </ChartFrame>

        <ChartFrame
          title="Habit consistency"
          subtitle="Share of due daily habits kept"
          table={{ columns: ["Day", "Kept"], rows: series.map((p) => [formatDay(p.date, "EEE d MMM"), p.habitRate === null ? "–" : `${p.habitRate}%`]) }}
        >
          <ChartBox>
            <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -4 }}>
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis dataKey="label" {...axisProps} interval={tickInterval} minTickGap={24} />
              <YAxis {...axisProps} domain={[0, 100]} ticks={[0, 50, 100]} tickFormatter={(v) => `${v}%`} width={44} />
              <Tooltip cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }} content={<ChartTooltip labelFormat={label} format={(v) => `${v}%`} />} />
              <Line {...chartMotion} dataKey="habitRate" name="Kept" type="monotone" stroke="var(--mint)" strokeWidth={2} dot={range === 7 ? { r: 4, strokeWidth: 2, stroke: "var(--card)", fill: "var(--mint)" } : false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} connectNulls={false} />
            </LineChart>
          </ChartBox>
        </ChartFrame>

        <AreaBars
          title="Focus by area"
          unit="min"
          rows={AREA_CHART_ORDER.map((a) => ({ area: a, value: areas.find((x) => x.area === a)!.focusMin }))}
          format={(v) => formatDuration(v)}
        />
        <AreaBars
          title="Tasks finished by area"
          unit="tasks"
          rows={AREA_CHART_ORDER.map((a) => ({ area: a, value: areas.find((x) => x.area === a)!.tasks }))}
          format={(v) => String(v)}
        />

        <RadarWidget values={radar} />

        <Panel>
          <h2 className="text-[1.05rem] font-semibold tracking-tight">Activity</h2>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">Tasks, check-ins, focus sessions and reflections per day, last 26 weeks</p>
          <Heatmap
            end={today}
            weeks={26}
            weekStartsOn={prefs.weekStartsOn}
            label="Daily activity"
            value={(d) => {
              const v = heat.get(d) ?? 0
              return v / maxActivity
            }}
            describe={(d) => `${formatDay(d, "EEE d MMM")}: ${heat.get(d) ?? 0} recorded actions`}
          />
          <p className="mt-4 rounded-2xl border border-dashed border-line p-3 text-xs text-muted-foreground">
            Weekly review (achievements, unfinished work and next steps) arrives with Goals in Phase 2.
          </p>
        </Panel>
      </div>
      <SummaryNote summary={summary} />
    </PageTransition>
  )
}

function ChartBox({ children }: { children: React.ReactElement }) {
  return (
    <div className="h-[240px]">
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  )
}

/** One measure across areas: a single colour for the bars, the area named on each row. */
function AreaBars({ title, unit, rows, format }: { title: string; unit: string; rows: { area: (typeof AREA_CHART_ORDER)[number]; value: number }[]; format: (v: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <ChartFrame title={title} subtitle="Selected range" table={{ columns: ["Area", unit], rows: rows.map((r) => [AREA_META[r.area].label, r.value]) }}>
      <ul className="space-y-3 py-1">
        {rows.map((r) => (
          <li key={r.area} className="group grid grid-cols-[88px_1fr_64px] items-center gap-3" title={`${AREA_META[r.area].label}: ${format(r.value)}`}>
            <span className="flex items-center gap-2 text-sm">
              <span className="size-2 rounded-full" style={{ background: AREA_META[r.area].color }} />
              {AREA_META[r.area].label}
            </span>
            <span className="relative h-5 overflow-hidden rounded-[4px] bg-surface-2/70">
              <span className="absolute inset-0 origin-left bg-violet transition-transform duration-700 ease-[var(--ease-out)] group-hover:brightness-110" style={{ transform: `scaleX(${r.value / max})` }} />
            </span>
            <span className="text-right text-sm font-medium tabular">{format(r.value)}</span>
          </li>
        ))}
      </ul>
    </ChartFrame>
  )
}

function SummaryNote({ summary }: { summary: Summary }) {
  return (
    <p className="mt-6 text-center text-xs text-muted-backdrop on-backdrop">
      {summary.activeDays > 0
        ? `Active on ${summary.activeDays} days in this range. Days with nothing to measure are left out of the average score.`
        : "Start recording and this page will fill in."}
    </p>
  )
}
