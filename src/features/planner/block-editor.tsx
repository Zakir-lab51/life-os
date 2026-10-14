"use client"

import { useLiveQuery } from "dexie-react-hooks"
import { Play, Repeat, Trash2, TriangleAlert } from "lucide-react"
import { useRouter } from "next/navigation"
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
import { useBlock, useBlocks, usePrefs, useToday } from "@/lib/db/hooks"
import { createBlock, createBlockSeries, deleteBlock, endSeriesFrom, restoreBlock, restoreSeries, seriesSnapshot, skipSeriesDay, unskipSeriesDay, updateBlock, updateSeriesFrom, ValidationError } from "@/lib/db/repo"
import { formatClock, formatDay, hhmmToMinutes, minutesToHHMM, roundUpTo, weekday } from "@/lib/domain/dates"
import { describeDays } from "@/lib/domain/series"
import type { Block, BlockKind, ISODate } from "@/lib/domain/types"
import { cn } from "@/lib/utils"
import { attempt, reportError, succeeded } from "@/lib/feedback"
import { useFocus } from "@/lib/stores/focus"
import { useUI } from "@/lib/stores/ui"

export const KIND_LABEL: Record<BlockKind, string> = {
  event: "Event",
  task: "Task",
  focus: "Focus",
  break: "Break",
  routine: "Routine",
  habit: "Habits",
}

export async function deleteBlockWithUndo(id: string) {
  const current = await db.blocks.get(id)
  // one day of a repeating block: take that day out of the series, so it isn't made again
  if (current?.seriesId) {
    if (!(await succeeded(() => skipSeriesDay(current)))) return
    toast(`Removed "${current.title}" on this day`, { description: "It still repeats on its other days.", action: { label: "Undo", onClick: () => void attempt(() => unskipSeriesDay(current)) } })
    return
  }
  const block = await attempt(() => deleteBlock(id))
  if (!block) return
  toast(`Removed "${block.title}"`, { action: { label: "Undo", onClick: () => void attempt(() => restoreBlock(block)) } })
}

export function startFocusForBlock(block: Block, defaultMin: number, push: (href: string) => void) {
  const focus = useFocus.getState()
  if (focus.timer.status !== "idle") {
    toast("A timer is already running", { description: "Finish or reset it on the Focus page first." })
    push("/focus")
    return
  }
  const minutes = Math.max(5, Math.min(180, block.end - block.start || defaultMin))
  focus.begin({ mode: "custom", phase: "focus", minutes, taskId: block.taskId })
  toast.success(`Focus started · ${minutes} min`, { description: block.title })
  push("/focus")
}

export function BlockEditorDialog() {
  const { open, blockId, date, start } = useUI((s) => s.blockEditor)
  const close = useUI((s) => s.closeBlockEditor)
  const guard = useCloseGuard(close)
  const block = useBlock(blockId)
  const ready = !blockId || block !== undefined
  return (
    <Dialog open={open} onOpenChange={(o) => !o && guard.requestClose()}>
      <DialogContent className="max-h-[92dvh] gap-0 overflow-hidden rounded-dialog p-0 sm:max-w-lg">
        {open && ready && <BlockForm key={blockId ?? `new-${date}-${start}`} block={block ?? null} date={date} start={start} onDone={guard.close} guard={guard} />}
      </DialogContent>
    </Dialog>
  )
}

function BlockForm({ block, date, start, onDone, guard }: { block: Block | null; date: string | null; start: number | null; onDone: () => void; guard: CloseGuard }) {
  const today = useToday()
  const prefs = usePrefs()
  const router = useRouter()
  const initialStart = block?.start ?? start ?? Math.max(prefs?.dayStartMin ?? 480, roundUpTo(new Date().getHours() * 60 + new Date().getMinutes(), 15))
  const [title, setTitle] = useState(block?.title ?? "")
  const [kind, setKind] = useState<BlockKind>(block?.kind ?? "event")
  const [day, setDay] = useState(block?.date ?? date ?? today)
  const [from, setFrom] = useState(minutesToHHMM(Math.min(initialStart, 23 * 60)))
  const [to, setTo] = useState(minutesToHHMM(Math.min(block?.end ?? initialStart + 60, 24 * 60)))
  const [taskId, setTaskId] = useState<string | null>(block?.taskId ?? null)
  const [notes, setNotes] = useState(block?.notes ?? "")
  const [errors, setErrors] = useState<Record<string, string>>({})
  // repeating: a new (or one-off) block can repeat weekly; a day of a series changes just that day, or the series from then on
  const series = useLiveQuery(() => (block?.seriesId ? db.blockSeries.get(block.seriesId) : undefined), [block?.seriesId])
  const inSeries = !!block?.seriesId
  const [repeat, setRepeat] = useState(false)
  const [scope, setScope] = useState<"one" | "later">("one")
  const [days, setDays] = useState<number[]>(() => [weekday(block?.date ?? date ?? today)])
  const [until, setUntil] = useState<ISODate | null>(null)
  const [seeded, setSeeded] = useState<string | null>(null)
  if (series && seeded !== series.id) {
    setSeeded(series.id)
    setDays(series.days)
    setUntil(series.until)
  }
  const weekStartsOn = prefs?.weekStartsOn ?? 1
  const patterned = inSeries ? scope === "later" : repeat
  useUnsaved(guard, { title, kind, day, from, to, taskId, notes, repeat, scope, days, until })

  const openTasks = useLiveQuery(() => db.tasks.filter((t) => t.status !== "done").toArray(), [])
  const sameDay = useBlocks(day)
  const startMin = hhmmToMinutes(from)
  const endMin = hhmmToMinutes(to)
  const overlaps = useMemo(
    () => (sameDay ?? []).filter((b) => b.id !== block?.id && startMin !== null && endMin !== null && b.start < endMin && startMin < b.end),
    [sameDay, block, startMin, endMin],
  )

  const save = async () => {
    setErrors({})
    if (startMin === null || endMin === null) {
      setErrors({ end: "Enter both times as HH:mm" })
      revealFirstError()
      return
    }
    const input = { date: day, start: startMin, end: endMin, title, kind, taskId, notes }
    const pattern = { title, kind, start: startMin, end: endMin, notes, days, until }
    try {
      if (block && inSeries && scope === "later") {
        await updateSeriesFrom(block.seriesId!, pattern, block.date)
        toast.success("Repeating block updated", { description: `From ${formatDay(block.date, "d MMM")} on · ${describeDays(days, weekStartsOn)}` })
      } else if (patterned) {
        // a new block, or a one-off becoming weekly: the series starts on its day and takes its place
        await createBlockSeries({ ...pattern, from: day })
        if (block) await deleteBlock(block.id)
        toast.success("Repeating block added", { description: `${title.trim()} · ${describeDays(days, weekStartsOn)} · ${formatClock(startMin)}` })
      } else {
        if (block) await updateBlock(block.id, input)
        else await createBlock(input)
        toast.success(block ? "Block updated" : "Block added", { description: `${title.trim()} · ${formatClock(startMin)}` })
      }
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
        <DialogTitle>{block ? "Edit time block" : "New time block"}</DialogTitle>
        <DialogDescription>Blocks reserve time on your day&apos;s timeline.</DialogDescription>
      </DialogHeader>
      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
        <Field label="Type">
          <Segmented<BlockKind> ariaLabel="Block type" value={kind} onChange={setKind} options={(["event", "task", "focus", "break", "routine"] as BlockKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
        </Field>
        <Field label="Linked task (optional)" htmlFor="block-task">
          <Select
            value={taskId ?? "none"}
            onValueChange={(v) => {
              const id = v === "none" ? null : v
              setTaskId(id)
              const t = openTasks?.find((x) => x.id === id)
              if (t && !title.trim()) setTitle(t.title)
              if (t && kind === "event") setKind("task")
            }}
          >
            <SelectTrigger id="block-task" className="h-10 w-full rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No task</SelectItem>
              {(openTasks ?? []).map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Title" htmlFor="block-title" error={errors.title}>
          <Input id="block-title" autoFocus={!block} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Lecture, deep work, lunch…" className="h-11 rounded-xl" maxLength={120} />
        </Field>
        <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-3">
          <Field label="Day" htmlFor="block-day">
            <DatePicker id="block-day" value={day} onChange={(v) => v && setDay(v)} allowClear={false} />
          </Field>
          <Field label="From" htmlFor="block-from">
            <Input id="block-from" type="time" step={300} value={from} onChange={(e) => setFrom(e.target.value)} className="h-10 rounded-xl" />
          </Field>
          <Field label="To" htmlFor="block-to" error={errors.end}>
            <Input id="block-to" type="time" step={300} value={to} onChange={(e) => setTo(e.target.value)} className="h-10 rounded-xl" aria-invalid={!!errors.end} />
          </Field>
        </div>
        {overlaps.length > 0 && (
          <p className="flex items-start gap-2 rounded-xl border border-amber/30 bg-amber/10 px-3 py-2 text-xs text-amber" role="status">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            Overlaps {overlaps.map((b) => `"${b.title}" (${formatClock(b.start)})`).join(", ")}. You can still save it.
          </p>
        )}
        {inSeries ? (
          <div className="space-y-3 rounded-2xl border border-line p-3">
            <p className="flex items-center gap-2 text-sm">
              <Repeat className="size-4 shrink-0 text-violet" aria-hidden />
              Repeats {series ? describeDays(series.days, weekStartsOn).replace(/^Every day$/, "every day") : "…"}
              {series?.until ? `, until ${formatDay(series.until, "d MMM")}` : ""}
            </p>
            <Segmented<"one" | "later">
              ariaLabel="Change"
              value={scope}
              onChange={setScope}
              options={[
                { value: "one", label: "Just this day" },
                { value: "later", label: "This and later days" },
              ]}
            />
          </div>
        ) : (
          !taskId && (
            <Field label="Repeat">
              <Segmented<"once" | "weekly">
                ariaLabel="Repeat"
                value={repeat ? "weekly" : "once"}
                onChange={(v) => setRepeat(v === "weekly")}
                options={[
                  { value: "once", label: "Doesn't repeat" },
                  { value: "weekly", label: "Weekly" },
                ]}
              />
            </Field>
          )
        )}
        {patterned && (
          <>
            <Field label="On" error={errors.days}>
              <DayChips days={days} onChange={setDays} weekStartsOn={weekStartsOn} />
            </Field>
            <Field label="Until (optional)" htmlFor="block-until" error={errors.until}>
              <DatePicker id="block-until" value={until} onChange={setUntil} placeholder="No end" />
            </Field>
          </>
        )}
        <Field label="Notes" htmlFor="block-notes">
          <Textarea id="block-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-20 rounded-xl" maxLength={2000} />
        </Field>
      </div>
      <DialogFooter className="flex-row items-center gap-2 border-t border-line bg-surface-2/40 px-6 py-4 sm:justify-between">
        <div className="flex gap-1">
          {block && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => {
                  onDone()
                  void deleteBlockWithUndo(block.id)
                }}
              >
                <Trash2 /> Remove
              </Button>
              {inSeries && (
                <Button type="button" variant="ghost" size="sm" onClick={() => void stopRepeating(block, onDone)}>
                  <Repeat /> Stop repeating
                </Button>
              )}
              {(block.kind === "focus" || block.kind === "task") && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onDone()
                    startFocusForBlock(block, prefs?.focus.focusMin ?? 25, router.push)
                  }}
                >
                  <Play /> Focus now
                </Button>
              )}
            </>
          )}
        </div>
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit">{block ? "Save" : "Add block"}</Button>
        </div>
      </DialogFooter>
      <DiscardBar guard={guard} />
    </form>
  )
}

/** Ends a series from this block's day: earlier days stay, this one and later go. Undo puts them back. */
async function stopRepeating(block: Block, done: () => void) {
  if (!block.seriesId) return
  const snapshot = await seriesSnapshot(block.seriesId, block.date)
  if (!(await succeeded(() => endSeriesFrom(block.seriesId!, block.date)))) return
  done()
  toast(`"${block.title}" stops repeating`, {
    description: `From ${formatDay(block.date, "d MMM")} on`,
    action: snapshot ? { label: "Undo", onClick: () => void attempt(() => restoreSeries(snapshot)) } : undefined,
  })
}

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"]
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

/** Seven toggles, in the order of your week; at least one stays on. */
function DayChips({ days, onChange, weekStartsOn }: { days: number[]; onChange: (d: number[]) => void; weekStartsOn: 0 | 1 }) {
  const order = Array.from({ length: 7 }, (_, i) => (i + weekStartsOn) % 7)
  return (
    <div className="flex gap-1.5" role="group" aria-label="Days it repeats on">
      {order.map((d) => {
        const on = days.includes(d)
        return (
          <button
            key={d}
            type="button"
            aria-pressed={on}
            aria-label={DAY_NAMES[d]}
            onClick={() => onChange(on ? (days.length > 1 ? days.filter((x) => x !== d) : days) : [...days, d].sort())}
            className={cn("pressable grid size-9 place-items-center rounded-full text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring", on ? "bg-foreground text-background" : "bg-foreground/[0.06] hover:bg-foreground/10")}
          >
            {DAY_LETTERS[d]}
          </button>
        )
      })}
    </div>
  )
}
