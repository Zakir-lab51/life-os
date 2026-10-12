"use client"

import { Archive, ArchiveRestore, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { DiscardBar, revealFirstError, useCloseGuard, useUnsaved, type CloseGuard } from "@/components/os/editor-guard"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Field, Segmented } from "@/components/os/field"
import { HABIT_ICONS } from "@/components/os/icon"
import { DatePicker } from "@/components/os/date-picker"
import { useHabit, useToday } from "@/lib/db/hooks"
import { createHabit, deleteHabit, restoreHabit, setHabitArchived, updateHabit, ValidationError } from "@/lib/db/repo"
import { ACCENT_CLASSES, AREA_META } from "@/lib/domain/areas"
import { WEEKDAY_SHORT } from "@/lib/domain/dates"
import { AREAS, type AccentColor, type Habit, type HabitSchedule, type TimeOfDay } from "@/lib/domain/types"
import type { HabitInput } from "@/lib/validation/schemas"
import { attempt, reportError, succeeded } from "@/lib/feedback"
import { useUI } from "@/lib/stores/ui"
import { cn } from "@/lib/utils"

const COLORS: AccentColor[] = ["violet", "cyan", "blue", "mint", "amber", "rose", "lilac"]

export async function deleteHabitWithUndo(habit: Habit) {
  const snapshot = await attempt(() => deleteHabit(habit.id))
  if (!snapshot) return
  toast(`Deleted "${habit.name}" and its ${snapshot.logs.length} check-ins`, {
    action: { label: "Undo", onClick: () => void attempt(() => restoreHabit(snapshot)) },
    duration: 8000,
  })
}

export function HabitEditorDialog() {
  const { open, habitId, defaults } = useUI((s) => s.habitEditor)
  const close = useUI((s) => s.closeHabitEditor)
  const guard = useCloseGuard(close)
  const habit = useHabit(habitId)
  const ready = !habitId || habit !== undefined
  return (
    <Dialog open={open} onOpenChange={(o) => !o && guard.requestClose()}>
      <DialogContent className="max-h-[92dvh] gap-0 overflow-hidden rounded-dialog p-0 sm:max-w-xl">
        {open && ready && <HabitForm key={habitId ?? "new"} habit={habit ?? null} defaults={defaults} onDone={guard.close} guard={guard} />}
      </DialogContent>
    </Dialog>
  )
}

function HabitForm({ habit, defaults, onDone, guard }: { habit: Habit | null; defaults: Partial<HabitInput> | null; onDone: () => void; guard: CloseGuard }) {
  const today = useToday()
  const [name, setName] = useState(habit?.name ?? defaults?.name ?? "")
  const [icon, setIcon] = useState(habit?.icon ?? defaults?.icon ?? "Sparkles")
  const [color, setColor] = useState<AccentColor>(habit?.color ?? defaults?.color ?? "violet")
  const [area, setArea] = useState(habit?.area ?? defaults?.area ?? "health")
  const [schedule, setSchedule] = useState<HabitSchedule>(habit?.schedule ?? defaults?.schedule ?? { kind: "daily" })
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>(habit?.timeOfDay ?? defaults?.timeOfDay ?? "anytime")
  const [startDate, setStartDate] = useState(habit?.startDate ?? today)
  const [errors, setErrors] = useState<Record<string, string>>({})
  useUnsaved(guard, { name, icon, color, area, schedule, timeOfDay, startDate })

  const save = async () => {
    setErrors({})
    const input: HabitInput = { name, icon, color, area, schedule, timeOfDay, startDate }
    try {
      if (habit) await updateHabit(habit.id, input)
      else await createHabit(input)
      toast.success(habit ? "Habit saved" : "Habit created", { description: name.trim() })
      onDone()
    } catch (e) {
      if (e instanceof ValidationError) {
        setErrors(e.fields)
        revealFirstError()
      } else reportError(e)
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
        <DialogTitle>{habit ? "Edit habit" : "New habit"}</DialogTitle>
        <DialogDescription>Small, specific and scheduled beats ambitious and vague.</DialogDescription>
      </DialogHeader>
      <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
        <Field label="Name" htmlFor="habit-name" error={errors.name}>
          <Input id="habit-name" autoFocus={!habit} value={name} onChange={(e) => setName(e.target.value)} placeholder="Read 20 pages" className="h-11 rounded-xl text-base" maxLength={60} aria-invalid={!!errors.name} />
        </Field>

        <Field label="Icon and colour">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Icon">
              {Object.entries(HABIT_ICONS).map(([key, I]) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={icon === key}
                  aria-label={key}
                  onClick={() => setIcon(key)}
                  className={cn("grid size-9 place-items-center rounded-xl border transition-colors", icon === key ? cn("border-transparent", ACCENT_CLASSES[color].soft, ACCENT_CLASSES[color].text) : "border-line text-muted-foreground hover:text-foreground")}
                >
                  <I className="size-4" />
                </button>
              ))}
            </div>
            <div className="flex gap-2" role="radiogroup" aria-label="Colour">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === c}
                  aria-label={c}
                  onClick={() => setColor(c)}
                  className={cn("size-7 rounded-full ring-offset-2 ring-offset-background transition-all", ACCENT_CLASSES[c].bg, color === c && "ring-2 ring-foreground")}
                />
              ))}
            </div>
          </div>
        </Field>

        <Field label="Schedule" error={errors["schedule.days"] ?? errors["schedule.times"]}>
          <div className="space-y-3">
            <Segmented<HabitSchedule["kind"]>
              ariaLabel="Schedule"
              value={schedule.kind}
              onChange={(k) => setSchedule(k === "daily" ? { kind: "daily" } : k === "weekdays" ? { kind: "weekdays", days: [1, 2, 3, 4, 5] } : { kind: "weekly", times: 3 })}
              options={[
                { value: "daily", label: "Every day" },
                { value: "weekdays", label: "Specific days" },
                { value: "weekly", label: "Times per week" },
              ]}
            />
            {schedule.kind === "weekdays" && (
              <div className="flex flex-wrap gap-1" role="group" aria-label="Days">
                {WEEKDAY_SHORT.map((n, i) => {
                  const on = schedule.days.includes(i)
                  return (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setSchedule({ kind: "weekdays", days: on ? schedule.days.filter((x) => x !== i) : [...schedule.days, i] })}
                      className={cn("h-8 w-11 rounded-full border text-xs font-medium", on ? "border-violet bg-violet/15 text-violet" : "border-line text-muted-foreground")}
                    >
                      {n}
                    </button>
                  )
                })}
              </div>
            )}
            {schedule.kind === "weekly" && (
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Input type="number" min={1} max={7} value={schedule.times} onChange={(e) => setSchedule({ kind: "weekly", times: Math.min(7, Math.max(1, Number(e.target.value) || 1)) })} className="h-9 w-20 rounded-lg" aria-label="Times per week" />
                times a week, any days
              </label>
            )}
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Area" htmlFor="habit-area">
            <Select value={area} onValueChange={(v) => setArea(v as Habit["area"])}>
              <SelectTrigger id="habit-area" className="h-10 w-full rounded-xl">
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
          <Field label="Best time" htmlFor="habit-time" hint="Plan My Day uses this">
            <Select value={timeOfDay} onValueChange={(v) => setTimeOfDay(v as TimeOfDay)}>
              <SelectTrigger id="habit-time" className="h-10 w-full rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="morning">Morning</SelectItem>
                <SelectItem value="afternoon">Afternoon</SelectItem>
                <SelectItem value="evening">Evening</SelectItem>
                <SelectItem value="anytime">Any time</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Started" htmlFor="habit-start" error={errors.startDate}>
            <DatePicker id="habit-start" value={startDate} onChange={(v) => v && setStartDate(v)} allowClear={false} />
          </Field>
        </div>
      </div>
      <DialogFooter className="flex-row items-center gap-2 border-t border-line bg-surface-2/40 px-6 py-4 sm:justify-between">
        <div className="flex gap-1">
          {habit && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={async () => {
                  onDone()
                  if (!(await succeeded(() => setHabitArchived(habit.id, !habit.archivedAt)))) return
                  toast(habit.archivedAt ? "Habit restored" : "Habit archived", { description: habit.archivedAt ? undefined : "Its history is kept. Restore it any time." })
                }}
              >
                {habit.archivedAt ? <ArchiveRestore /> : <Archive />} {habit.archivedAt ? "Unarchive" : "Archive"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => {
                  onDone()
                  void deleteHabitWithUndo(habit)
                }}
              >
                <Trash2 /> Delete
              </Button>
            </>
          )}
        </div>
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit">{habit ? "Save" : "Create habit"}</Button>
        </div>
      </DialogFooter>
      <DiscardBar guard={guard} />
    </form>
  )
}
