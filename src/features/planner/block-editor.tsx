"use client"

import { useLiveQuery } from "dexie-react-hooks"
import { Play, Trash2, TriangleAlert } from "lucide-react"
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
import { createBlock, deleteBlock, restoreBlock, updateBlock, ValidationError } from "@/lib/db/repo"
import { formatClock, hhmmToMinutes, minutesToHHMM, roundUpTo } from "@/lib/domain/dates"
import type { Block, BlockKind } from "@/lib/domain/types"
import { attempt, reportError } from "@/lib/feedback"
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
  useUnsaved(guard, { title, kind, day, from, to, taskId, notes })

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
    try {
      if (block) await updateBlock(block.id, input)
      else await createBlock(input)
      toast.success(block ? "Block updated" : "Block added", { description: `${title.trim()} · ${formatClock(startMin)}` })
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
