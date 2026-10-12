"use client"

import { useLiveQuery } from "dexie-react-hooks"
import { Check, Plus, X } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { DiscardBar, revealFirstError, useCloseGuard, useUnsaved, type CloseGuard } from "@/components/os/editor-guard"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { DatePicker } from "@/components/os/date-picker"
import { Field, Segmented } from "@/components/os/field"
import { db } from "@/lib/db/db"
import { useGoal, usePrefs } from "@/lib/db/hooks"
import { ValidationError, createGoal, updateGoal } from "@/lib/db/repo"
import { AREA_META } from "@/lib/domain/areas"
import { todayISO } from "@/lib/domain/dates"
import { HORIZON_META, defaultDueDate, parentCandidates } from "@/lib/domain/goals"
import { AREAS, GOAL_HORIZONS, type Goal, type GoalHorizon, type GoalMeasure, type Milestone } from "@/lib/domain/types"
import { reportError } from "@/lib/feedback"
import type { GoalInput } from "@/lib/validation/schemas"
import { useUI } from "@/lib/stores/ui"
import { cn, uid } from "@/lib/utils"

type MeasureKind = GoalMeasure["kind"]

interface Draft {
  title: string
  why: string
  horizon: GoalHorizon
  area: Goal["area"]
  startDate: string
  dueDate: string | null
  kind: MeasureKind
  unit: string
  start: string
  target: string
  habitId: string | null
  habitTarget: string
  milestones: Milestone[]
  habitIds: string[]
  parentId: string | null
}

function toDraft(g: Goal | null, defaults: Partial<GoalInput> | null, weekStartsOn: 0 | 1): Draft {
  const horizon = g?.horizon ?? defaults?.horizon ?? "month"
  const startDate = g?.startDate ?? defaults?.startDate ?? todayISO()
  const m = g?.measure ?? defaults?.measure ?? { kind: "milestones" }
  return {
    title: g?.title ?? defaults?.title ?? "",
    why: g?.why ?? defaults?.why ?? "",
    horizon,
    area: g?.area ?? defaults?.area ?? "personal",
    startDate,
    dueDate: g ? g.dueDate : (defaults?.dueDate ?? defaultDueDate(horizon, startDate, weekStartsOn)),
    kind: m.kind,
    unit: m.kind === "target" ? m.unit : "",
    start: m.kind === "target" ? String(m.start) : "0",
    target: m.kind === "target" ? String(m.target) : "",
    habitId: m.kind === "habit" ? m.habitId : null,
    habitTarget: m.kind === "habit" ? String(m.target) : "",
    milestones: g?.milestones ?? (defaults?.milestones as Milestone[] | undefined) ?? [],
    habitIds: g?.habitIds ?? defaults?.habitIds ?? [],
    parentId: g?.parentId ?? defaults?.parentId ?? null,
  }
}

function toMeasure(d: Draft): GoalMeasure | { error: string; path: string } {
  switch (d.kind) {
    case "milestones":
    case "tasks":
      return { kind: d.kind }
    case "target": {
      const start = Number(d.start)
      const target = Number(d.target)
      if (d.target.trim() === "" || !Number.isFinite(target)) return { error: "Enter the number you're aiming for", path: "measure.target" }
      if (!Number.isFinite(start)) return { error: "Enter where you're starting from", path: "measure.start" }
      return { kind: "target", unit: d.unit.trim(), start, target }
    }
    case "habit": {
      const target = Math.round(Number(d.habitTarget))
      if (!d.habitId) return { error: "Choose a habit", path: "measure.habitId" }
      if (!Number.isFinite(target) || target < 1) return { error: "How many check-ins?", path: "measure.target" }
      return { kind: "habit", habitId: d.habitId, target }
    }
  }
}

export function GoalEditorDialog() {
  const { open, goalId, defaults } = useUI((s) => s.goalEditor)
  const close = useUI((s) => s.closeGoalEditor)
  const guard = useCloseGuard(close)
  const goal = useGoal(goalId)
  const prefs = usePrefs()
  const ready = (!goalId || goal !== undefined) && !!prefs

  return (
    <Dialog open={open} onOpenChange={(o) => !o && guard.requestClose()}>
      <DialogContent className="max-h-[92dvh] gap-0 overflow-hidden rounded-dialog p-0 sm:max-w-2xl">
        {open && ready &&
          (goal === null && goalId ? (
            <div className="p-8 text-center">
              <DialogTitle>Goal not found</DialogTitle>
              <DialogDescription className="mt-2">It may have been deleted.</DialogDescription>
            </div>
          ) : (
            <GoalForm key={goalId ?? "new"} goal={goal ?? null} defaults={defaults} weekStartsOn={prefs!.weekStartsOn} onDone={guard.close} guard={guard} />
          ))}
      </DialogContent>
    </Dialog>
  )
}

function GoalForm({ goal, defaults, weekStartsOn, onDone, guard }: { goal: Goal | null; defaults: Partial<GoalInput> | null; weekStartsOn: 0 | 1; onDone: () => void; guard: CloseGuard }) {
  const [d, setD] = useState<Draft>(() => toDraft(goal, defaults, weekStartsOn))
  const [dueTouched, setDueTouched] = useState(!!goal)
  const [errors, setErrors] = useState<Record<string, string>>({})
  useUnsaved(guard, d)
  const [saving, setSaving] = useState(false)
  const [newMilestone, setNewMilestone] = useState({ title: "", due: null as string | null })
  const allHabits = useLiveQuery(() => db.habits.orderBy("order").toArray(), [])
  // archived habits stay listed only while this goal still uses them
  const habits = allHabits?.filter((h) => !h.archivedAt || h.id === d.habitId || d.habitIds.includes(h.id))
  const goals = useLiveQuery(() => db.goals.toArray(), [])
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }))

  const parents = useMemo(() => parentCandidates({ id: goal?.id ?? "__new__", horizon: d.horizon }, goals ?? []), [goal?.id, d.horizon, goals])

  const setHorizon = (horizon: GoalHorizon) =>
    setD((p) => ({
      ...p,
      horizon,
      dueDate: dueTouched ? p.dueDate : defaultDueDate(horizon, p.startDate, weekStartsOn),
      // a serving link must point to a longer horizon
      parentId: p.parentId && parentCandidates({ id: goal?.id ?? "__new__", horizon }, goals ?? []).some((g) => g.id === p.parentId) ? p.parentId : null,
    }))

  const addMilestone = () => {
    const title = newMilestone.title.trim()
    if (!title) return
    set("milestones", [...d.milestones, { id: uid("ms_"), title: title.slice(0, 120), due: newMilestone.due, doneAt: null }])
    setNewMilestone({ title: "", due: null })
  }

  const save = async () => {
    const measure = toMeasure(d)
    if ("error" in measure) return setErrors({ [measure.path]: measure.error })
    const known = allHabits ? new Set(allHabits.map((h) => h.id)) : null
    if (known && measure.kind === "habit" && !known.has(measure.habitId)) return setErrors({ "measure.habitId": "That habit was deleted. Choose another." })
    const input: GoalInput = {
      title: d.title,
      why: d.why,
      horizon: d.horizon,
      area: d.area,
      startDate: d.startDate,
      dueDate: d.dueDate,
      measure,
      milestones: d.milestones,
      habitIds: known ? d.habitIds.filter((id) => known.has(id)) : d.habitIds,
      parentId: d.parentId,
    }
    setSaving(true)
    try {
      if (goal) await updateGoal(goal.id, input)
      else {
        const created = await createGoal(input)
        toast.success("Goal set", { description: created.title, action: { label: "Open", onClick: () => useUI.getState().showGoal(created.id) } })
      }
      onDone()
    } catch (e) {
      if (e instanceof ValidationError) {
        setErrors(e.fields)
        revealFirstError()
      } else reportError(e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      className="relative flex max-h-[92dvh] flex-col"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <DialogHeader className="border-b border-line px-6 pt-6 pb-4">
        <DialogTitle>{goal ? "Edit goal" : "New goal"}</DialogTitle>
        <DialogDescription>Make it specific. Then decide how you’ll know you’re getting there.</DialogDescription>
      </DialogHeader>

      <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
        <Field label="Goal" htmlFor="goal-title" error={errors.title}>
          <Input id="goal-title" autoFocus value={d.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Run a half marathon" maxLength={160} className="h-11 rounded-xl text-base" />
        </Field>
        <Field label="Why it matters" htmlFor="goal-why" hint="Optional. You'll see this when you open the goal.">
          <Textarea id="goal-why" value={d.why} onChange={(e) => set("why", e.target.value)} placeholder="What changes for you when it's done?" maxLength={2000} className="min-h-16 rounded-xl" />
        </Field>

        <Field label="Horizon" error={errors.horizon}>
          <Segmented<GoalHorizon> ariaLabel="Horizon" value={d.horizon} onChange={setHorizon} options={GOAL_HORIZONS.map((h) => ({ value: h, label: HORIZON_META[h].label }))} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Area" htmlFor="goal-area">
            <Select value={d.area} onValueChange={(v) => set("area", v as Goal["area"])}>
              <SelectTrigger id="goal-area" className="h-10 w-full rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AREAS.map((a) => (
                  <SelectItem key={a} value={a}>
                    {AREA_META[a].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Starts" htmlFor="goal-start" error={errors.startDate}>
            <DatePicker
              id="goal-start"
              value={d.startDate}
              allowClear={false}
              onChange={(v) => v && setD((p) => ({ ...p, startDate: v, dueDate: dueTouched ? p.dueDate : defaultDueDate(p.horizon, v, weekStartsOn) }))}
            />
          </Field>
          <Field label="Deadline" htmlFor="goal-due" error={errors.dueDate}>
            <DatePicker
              id="goal-due"
              value={d.dueDate}
              placeholder="No deadline"
              invalid={!!errors.dueDate}
              onChange={(v) => {
                setDueTouched(true)
                set("dueDate", v)
              }}
            />
          </Field>
        </div>

        <Field label="Measure progress by">
          <div className="space-y-3">
            <Segmented<MeasureKind>
              ariaLabel="Measure progress by"
              value={d.kind}
              onChange={(v) => set("kind", v)}
              options={[
                { value: "milestones", label: "Milestones" },
                { value: "tasks", label: "Linked tasks" },
                { value: "target", label: "A number" },
                { value: "habit", label: "A habit" },
              ]}
            />
            {d.kind === "tasks" && <p className="text-xs text-muted-foreground">Pick this goal in any task’s editor (or add tasks from the goal’s page); progress is the share of them you’ve finished.</p>}
            {d.kind === "target" && (
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Starting at" htmlFor="goal-start-value" error={errors["measure.start"]}>
                  <Input id="goal-start-value" type="number" inputMode="decimal" value={d.start} onChange={(e) => set("start", e.target.value)} className="h-10 rounded-xl" />
                </Field>
                <Field label="Target" htmlFor="goal-target" error={errors["measure.target"]}>
                  <Input id="goal-target" type="number" inputMode="decimal" value={d.target} onChange={(e) => set("target", e.target.value)} placeholder="24" className="h-10 rounded-xl" />
                </Field>
                <Field label="Unit" htmlFor="goal-unit" hint="books, km, ₹…">
                  <Input id="goal-unit" value={d.unit} onChange={(e) => set("unit", e.target.value)} maxLength={20} placeholder="books" className="h-10 rounded-xl" />
                </Field>
              </div>
            )}
            {d.kind === "habit" && (
              <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
                <Field label="Habit" htmlFor="goal-habit" error={errors["measure.habitId"]}>
                  <Select value={d.habitId ?? ""} onValueChange={(v) => set("habitId", v)}>
                    <SelectTrigger id="goal-habit" className="h-10 w-full rounded-xl">
                      <SelectValue placeholder={habits?.length ? "Choose a habit" : "No habits yet"} />
                    </SelectTrigger>
                    <SelectContent>
                      {(habits ?? []).map((h) => (
                        <SelectItem key={h.id} value={h.id}>
                          {h.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Check-ins" htmlFor="goal-habit-target" error={errors["measure.target"]}>
                  <Input id="goal-habit-target" type="number" inputMode="numeric" min={1} value={d.habitTarget} onChange={(e) => set("habitTarget", e.target.value)} placeholder="20" className="h-10 rounded-xl" />
                </Field>
              </div>
            )}
          </div>
        </Field>

        <Field label={`Milestones${d.milestones.length ? ` · ${d.milestones.length}` : ""}`} hint={d.kind === "milestones" ? "Progress is the share of these you reach." : "They also show on your Life Roadmap."} error={errors.milestones}>
          <div className="space-y-1.5">
            {d.milestones.map((m, i) => (
              <div key={m.id} className="flex items-center gap-2">
                <span className={cn("grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold", m.doneAt ? "bg-mint text-white" : "bg-surface-3 text-muted-foreground")}>{m.doneAt ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}</span>
                <Input value={m.title} onChange={(e) => set("milestones", d.milestones.map((x) => (x.id === m.id ? { ...x, title: e.target.value } : x)))} aria-label={`Milestone ${i + 1}`} maxLength={120} className="h-9 flex-1 rounded-xl" />
                <div className="w-36 shrink-0">
                  <DatePicker value={m.due} placeholder="No date" onChange={(v) => set("milestones", d.milestones.map((x) => (x.id === m.id ? { ...x, due: v } : x)))} />
                </div>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${m.title}`} onClick={() => set("milestones", d.milestones.filter((x) => x.id !== m.id))}>
                  <X />
                </Button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <span className="grid size-6 shrink-0 place-items-center text-violet">
                <Plus className="size-4" />
              </span>
              <Input
                value={newMilestone.title}
                onChange={(e) => setNewMilestone((p) => ({ ...p, title: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return
                  e.preventDefault()
                  addMilestone()
                }}
                placeholder="Add a milestone"
                aria-label="New milestone"
                maxLength={120}
                className="h-9 flex-1 rounded-xl"
              />
              <div className="w-36 shrink-0">
                <DatePicker value={newMilestone.due} placeholder="No date" onChange={(v) => setNewMilestone((p) => ({ ...p, due: v }))} />
              </div>
              <Button type="button" variant="secondary" size="icon-sm" aria-label="Add milestone" onClick={addMilestone} disabled={!newMilestone.title.trim()}>
                <Plus />
              </Button>
            </div>
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Serves" htmlFor="goal-parent" error={errors.parentId} hint="A bigger goal this one moves forward.">
            <Select value={d.parentId ?? "none"} onValueChange={(v) => set("parentId", v === "none" ? null : v)}>
              <SelectTrigger id="goal-parent" className="h-10 w-full rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nothing bigger</SelectItem>
                {parents.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {HORIZON_META[g.horizon].adjective}: {g.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Supporting habits" hint="Shown with the goal and on the roadmap.">
            <div className="flex flex-wrap gap-1.5">
              {(habits ?? []).map((h) => {
                const on = d.habitIds.includes(h.id)
                return (
                  <button
                    key={h.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set("habitIds", on ? d.habitIds.filter((x) => x !== h.id) : [...d.habitIds, h.id])}
                    className={cn("pressable rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition-colors", on ? "bg-violet/15 text-foreground ring-violet/40" : "text-muted-foreground ring-line hover:text-foreground")}
                  >
                    {on && <Check className="mr-1 -ml-0.5 inline size-3" strokeWidth={3} />}
                    {h.name}
                  </button>
                )
              })}
              {!habits?.length && <span className="text-xs text-muted-foreground">No habits yet</span>}
            </div>
          </Field>
        </div>
      </div>

      <DialogFooter className="border-t border-line px-6 py-4">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving || !d.title.trim()}>
          {goal ? "Save" : "Set goal"}
        </Button>
      </DialogFooter>
      <DiscardBar guard={guard} />
    </form>
  )
}
