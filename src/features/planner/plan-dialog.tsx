"use client"

import { ChevronDown, ChevronUp, Info, TriangleAlert, WandSparkles } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState } from "@/components/os/visuals"
import { db } from "@/lib/db/db"
import { useBlocks } from "@/lib/db/hooks"
import { applyPlan } from "@/lib/db/repo"
import { daysBetween, formatClock, formatDay } from "@/lib/domain/dates"
import { habitsForDay, logsByHabit } from "@/lib/domain/habits"
import { findConflicts, planDay, totalFree, type PlanSuggestion } from "@/lib/domain/planner"
import { recommendTasks } from "@/lib/domain/scheduling"
import { attempt } from "@/lib/feedback"
import { useUI } from "@/lib/stores/ui"
import { cn } from "@/lib/utils"
import { useLife, type Life } from "@/features/shell/use-life"
import type { Block } from "@/lib/domain/types"
import { KIND_LABEL } from "./block-editor"

export function PlanMyDayDialog() {
  const open = useUI((s) => s.planOpen)
  const setOpen = useUI((s) => s.setPlanOpen)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[92dvh] gap-0 overflow-hidden rounded-dialog p-0 sm:max-w-2xl">{open && <PlanBody onDone={() => setOpen(false)} />}</DialogContent>
    </Dialog>
  )
}

function PlanBody({ onDone }: { onDone: () => void }) {
  const life = useLife()
  const plannerDate = useUI((s) => s.plannerDate)
  const date = plannerDate ?? life?.today ?? ""
  const blocks = useBlocks(date)
  if (!life || !blocks) return <div className="p-10 text-center text-sm text-muted-foreground">Looking at your day…</div>
  return <PlanReview key={date} life={life} blocks={blocks} date={date} onDone={onDone} />
}

function buildPlan(life: Life, blocks: Block[], date: string, now: Date) {
  const { data, prefs, today } = life
  if (daysBetween(today, date) < 0) return { past: true as const }
  const notBefore = date === today ? now.getHours() * 60 + now.getMinutes() : 0
  const free = totalFree(blocks, Math.max(prefs.dayStartMin, notBefore), prefs.dayEndMin)
  const ranked = recommendTasks(
    // undated tasks and anything due up to three days after this day
    data.tasks.filter((t) => !t.dueDate || daysBetween(t.dueDate, date) >= -3),
    { today: date, freeMinutes: free },
    12,
  )
  const habitsDue = habitsForDay(data.habits, logsByHabit(data.habitLogs), date, prefs.weekStartsOn)
    .filter((s) => !s.done && s.habit.timeOfDay !== "anytime")
    .map((s) => s.habit)
  return { past: false as const, ...planDay({ ranked, existing: blocks, habitsDue, dayStart: prefs.dayStartMin, dayEnd: prefs.dayEndMin, notBefore }) }
}

function PlanReview({ life, blocks, date, onDone }: { life: Life; blocks: Block[]; date: string; onDone: () => void }) {
  // computed once when the dialog opens, so the user's edits stay attached to the right suggestions
  const [plan] = useState(() => buildPlan(life, blocks, date, new Date()))
  const [edits, setEdits] = useState<Record<string, { include: boolean; shift: number }>>({})
  const [rulesOpen, setRulesOpen] = useState(false)

  const items: (PlanSuggestion & { include: boolean })[] = plan.past
    ? []
    : plan.suggestions.map((s) => {
        const e = edits[s.key] ?? { include: true, shift: 0 }
        return { ...s, start: s.start + e.shift, end: s.end + e.shift, include: e.include }
      })
  const chosen = items.filter((i) => i.include)
  const conflicts = findConflicts([...blocks.map((b) => ({ id: b.id, start: b.start, end: b.end })), ...chosen.map((c) => ({ id: c.key, start: c.start, end: c.end }))])

  const update = (key: string, patch: Partial<{ include: boolean; shift: number }>) =>
    setEdits((p) => ({ ...p, [key]: { ...(p[key] ?? { include: true, shift: 0 }), ...patch } }))

  const apply = async () => {
    const created = await attempt(() => applyPlan(date, chosen))
    if (!created) return
    onDone()
    toast.success(`Added ${created.length} block${created.length === 1 ? "" : "s"} to ${date === life.today ? "today" : formatDay(date)}`, {
      action: { label: "Undo", onClick: () => void attempt(() => db.blocks.bulkDelete(created.map((b) => b.id))) },
      duration: 8000,
    })
  }

  return (
    <div className="flex max-h-[92dvh] flex-col">
      <DialogHeader className="border-b border-line px-6 pt-6 pb-4">
        <DialogTitle className="flex items-center gap-2">
          <WandSparkles className="size-5 text-violet" /> Plan my day · {date === life.today ? "Today" : formatDay(date)}
        </DialogTitle>
        <DialogDescription>A suggestion for your free time. Nothing is added until you confirm, and existing blocks are never moved.</DialogDescription>
      </DialogHeader>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {plan.past ? (
          <EmptyState icon={Info} title="That day has passed" body="Plan My Day works for today and future days." compact />
        ) : items.length === 0 ? (
          <EmptyState icon={WandSparkles} title="Nothing to schedule" body="No open tasks or timed habits fit into the free time left. Add tasks or widen your day hours in Settings." compact />
        ) : (
          <ul className="space-y-2">
            {items.map((s) => (
              <li key={s.key} className={cn("flex items-start gap-3 rounded-2xl border border-line p-3 transition-opacity", !s.include && "opacity-50", conflicts.has(s.key) && s.include && "border-amber/50")}>
                <Checkbox checked={s.include} onCheckedChange={(v) => update(s.key, { include: !!v })} aria-label={`Include ${s.title}`} className="mt-1" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{s.title}</span>
                    <span className="rounded-control bg-surface-2 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">{KIND_LABEL[s.kind]}</span>
                    {conflicts.has(s.key) && s.include && (
                      <span className="inline-flex items-center gap-1 text-xs text-amber">
                        <TriangleAlert className="size-3" /> overlaps
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{s.reason}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span className="text-sm font-medium tabular">
                    {formatClock(s.start)} – {formatClock(s.end)}
                  </span>
                  <div className="flex flex-col">
                    <button type="button" aria-label="Move 15 minutes earlier" className="rounded p-0.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground" onClick={() => update(s.key, { shift: (edits[s.key]?.shift ?? 0) - 15 })} disabled={s.start - 15 < 0}>
                      <ChevronUp className="size-3.5" />
                    </button>
                    <button type="button" aria-label="Move 15 minutes later" className="rounded p-0.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground" onClick={() => update(s.key, { shift: (edits[s.key]?.shift ?? 0) + 15 })} disabled={s.end + 15 > 24 * 60}>
                      <ChevronDown className="size-3.5" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {!plan.past && plan.unscheduled.length > 0 && (
          <div className="mt-4 rounded-2xl border border-line bg-surface-2/50 p-3">
            <p className="text-xs font-semibold text-muted-foreground">Didn&apos;t fit</p>
            <ul className="mt-1 space-y-0.5 text-sm">
              {plan.unscheduled.map((u) => (
                <li key={u.title + u.reason}>
                  {u.title} <span className="text-xs text-muted-foreground">· {u.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <button type="button" onClick={() => setRulesOpen((o) => !o)} className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground" aria-expanded={rulesOpen}>
          <Info className="size-3.5" /> How this plan was made
        </button>
        {rulesOpen && (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>Only free time between your day start and end ({formatClock(life.prefs.dayStartMin)}–{formatClock(life.prefs.dayEndMin)}) is used{date === life.today ? ", starting from now" : ""}.</li>
            <li>Tasks are taken in recommendation order: priority, then deadline urgency, with boosts for in-progress work, quick wins and tasks that unblock others. Blocked tasks are skipped.</li>
            <li>Each task gets its estimate (15 min to 2 h). Tasks of 45+ minutes become focus blocks followed by a 10-minute break.</li>
            <li>Habits with a preferred time of day are grouped into one check-in block in that part of the day.</li>
          </ul>
        )}
      </div>

      <DialogFooter className="flex-row items-center gap-2 border-t border-line bg-surface-2/40 px-6 py-4 sm:justify-between">
        <span className="text-xs text-muted-foreground">
          {chosen.length} of {items.length} selected
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button onClick={() => void apply()} disabled={!chosen.length}>
            Add {chosen.length || ""} block{chosen.length === 1 ? "" : "s"}
          </Button>
        </div>
      </DialogFooter>
    </div>
  )
}
