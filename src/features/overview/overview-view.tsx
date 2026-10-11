"use client"

import { ArrowDown, ArrowUp, LayoutGrid, Plus, RotateCcw, Zap } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { PageTransition } from "@/components/os/page-header"
import { useBlocks, useNow } from "@/lib/db/hooks"
import { updatePrefs } from "@/lib/db/repo"
import { buildBriefing } from "@/lib/domain/briefing"
import { generateInsights } from "@/lib/domain/insights"
import { dailyScore, lifeBalance } from "@/lib/domain/scores"
import { WIDGET_IDS, type WidgetId } from "@/lib/domain/types"
import { attempt } from "@/lib/feedback"
import { useUI } from "@/lib/stores/ui"
import { useLife, type Life } from "@/features/shell/use-life"
import { evaluateProgress } from "@/features/shell/progress"
import { GoalsWidget } from "@/features/goals/goals-widget"
import {
  BriefingWidget,
  DeadlinesWidget,
  FocusWidget,
  HabitsWidget,
  HeroWidget,
  InsightWidget,
  RadarWidget,
  ScheduleWidget,
  TodayWidget,
  WeeklyWidget,
  XPWidget,
} from "./widgets"

export const WIDGET_META: Record<WidgetId, { label: string; description: string }> = {
  hero: { label: "Greeting & score", description: "Live clock and today's productivity score" },
  briefing: { label: "Daily briefing", description: "Top priorities, what needs attention, focus suggestions" },
  today: { label: "Today's tasks", description: "Due today and overdue" },
  radar: { label: "Life balance", description: "Radar across your life areas" },
  habits: { label: "Habits", description: "Check in today's habits" },
  focus: { label: "Focus", description: "Minutes today and the last 7 days" },
  schedule: { label: "Up next", description: "What's left on today's timeline" },
  deadlines: { label: "Upcoming deadlines", description: "The next two weeks" },
  weekly: { label: "Weekly targets", description: "Tasks, focus and habit consistency" },
  xp: { label: "Level & XP", description: "Progress and the next achievement" },
  insight: { label: "Insight", description: "A pattern from your own data" },
  goals: { label: "Goals", description: "Your active goals and whether they're on track" },
}

function OverviewSkeleton() {
  return (
    <div className="grid gap-4 @3xl/main:grid-cols-2 @5xl/main:grid-cols-4" aria-busy="true" aria-label="Loading dashboard">
      <Skeleton className="h-64 rounded-panel @3xl/main:col-span-2" />
      <Skeleton className="h-64 rounded-panel @3xl/main:col-span-2" />
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-72 rounded-panel" />
      ))}
    </div>
  )
}

export function OverviewView() {
  const life = useLife()
  const blocks = useBlocks(life?.today ?? "")
  if (!life || !blocks) return <OverviewSkeleton />
  return <Dashboard life={life} blocks={blocks} />
}

function Dashboard({ life, blocks }: { life: Life; blocks: NonNullable<ReturnType<typeof useBlocks>> }) {
  const now = new Date(useNow(60_000))
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const [customizing, setCustomizing] = useState(false)
  const setCapture = useUI((s) => s.setCapture)

  const computed = useMemo(() => {
    const briefing = buildBriefing({ data: life.data, blocks, prefs: life.prefs, today: life.today, nowMin })
    const score = dailyScore(life.today, life.data, life.prefs)
    const radar = lifeBalance(life.data, life.today, life.prefs).filter((r) => life.prefs.radarDims.includes(r.dim))
    const insights = generateInsights(life.data, life.today, life.prefs.weekStartsOn)
    const progress = evaluateProgress(life.data, life.today)
    return { briefing, score, radar, insights, progress }
  }, [life, blocks, nowMin])

  const render = (id: WidgetId) => {
    switch (id) {
      case "hero":
        return <HeroWidget key={id} life={life} score={computed.score} />
      case "briefing":
        return <BriefingWidget key={id} life={life} briefing={computed.briefing} />
      case "today":
        return <TodayWidget key={id} life={life} />
      case "radar":
        return <RadarWidget key={id} values={computed.radar} />
      case "habits":
        return <HabitsWidget key={id} life={life} />
      case "focus":
        return <FocusWidget key={id} life={life} />
      case "schedule":
        return <ScheduleWidget key={id} life={life} blocks={blocks} />
      case "deadlines":
        return <DeadlinesWidget key={id} life={life} />
      case "weekly":
        return <WeeklyWidget key={id} life={life} briefing={computed.briefing} />
      case "xp":
        return <XPWidget key={id} xp={computed.progress.xp} level={computed.progress.level} stats={computed.progress.stats} />
      case "insight":
        return <InsightWidget key={id} insights={computed.insights} />
      case "goals":
        return <GoalsWidget key={id} life={life} />
    }
  }

  const visible = life.prefs.widgets.filter((w) => w.visible)

  return (
    <PageTransition>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">Command centre</p>
          <h1 className="sr-only">Overview</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setCapture(true)}>
            <Zap /> Capture
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCustomizing(true)}>
            <LayoutGrid /> Customize
          </Button>
        </div>
      </div>
      {visible.length === 0 ? (
        <div className="glass rounded-panel p-10 text-center">
          <p className="font-medium">All widgets are hidden</p>
          <Button className="mt-4" onClick={() => setCustomizing(true)}>
            <Plus /> Choose widgets
          </Button>
        </div>
      ) : (
        <div className="grid grid-flow-row-dense gap-4 @3xl/main:grid-cols-2 @5xl/main:grid-cols-4">{visible.map((w) => render(w.id))}</div>
      )}
      <CustomizeDialog open={customizing} onOpenChange={setCustomizing} life={life} />
    </PageTransition>
  )
}

function CustomizeDialog({ open, onOpenChange, life }: { open: boolean; onOpenChange: (o: boolean) => void; life: Life }) {
  const widgets = life.prefs.widgets
  const save = (next: typeof widgets) => void attempt(() => updatePrefs({ widgets: next }))
  const move = (i: number, dir: -1 | 1) => {
    const next = [...widgets]
    const j = i + dir
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    save(next)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] gap-0 overflow-hidden rounded-dialog p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-line px-6 pt-6 pb-4">
          <DialogTitle>Customize your dashboard</DialogTitle>
          <DialogDescription>Show, hide and reorder widgets. Changes apply instantly.</DialogDescription>
        </DialogHeader>
        <ul className="max-h-[60dvh] space-y-1 overflow-y-auto px-4 py-3">
          {widgets.map((w, i) => (
            <li key={w.id} className="flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-surface-2/60">
              <div className="flex flex-col">
                <button type="button" aria-label={`Move ${WIDGET_META[w.id].label} up`} disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30">
                  <ArrowUp className="size-3.5" />
                </button>
                <button type="button" aria-label={`Move ${WIDGET_META[w.id].label} down`} disabled={i === widgets.length - 1} onClick={() => move(i, 1)} className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30">
                  <ArrowDown className="size-3.5" />
                </button>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{WIDGET_META[w.id].label}</p>
                <p className="text-xs text-muted-foreground">{WIDGET_META[w.id].description}</p>
              </div>
              <Switch checked={w.visible} onCheckedChange={(v) => save(widgets.map((x) => (x.id === w.id ? { ...x, visible: v } : x)))} aria-label={`Show ${WIDGET_META[w.id].label}`} />
            </li>
          ))}
          <li className="px-2 pt-3 text-xs text-muted-foreground">Finance summary and Study progress widgets arrive with their modules (Phases 3 and 4).</li>
        </ul>
        <DialogFooter className="border-t border-line bg-surface-2/40 px-6 py-4">
          <Button
            variant="ghost"
            onClick={() => {
              save(WIDGET_IDS.map((id) => ({ id, visible: true })))
              toast("Layout reset")
            }}
          >
            <RotateCcw /> Reset
          </Button>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
