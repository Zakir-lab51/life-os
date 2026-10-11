"use client"

import { useLiveQuery } from "dexie-react-hooks"
import { Check, Copy, Link2, Lock, Plus, Trash2, X } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { DatePicker } from "@/components/os/date-picker"
import { Field, Segmented } from "@/components/os/field"
import { TagInput } from "@/components/os/tag-input"
import { PriorityFlag } from "@/components/os/visuals"
import { db } from "@/lib/db/db"
import { useTask } from "@/lib/db/hooks"
import { createTask, updateTask, ValidationError } from "@/lib/db/repo"
import { AREA_META, PRIORITY_META } from "@/lib/domain/areas"
import { WEEKDAY_SHORT } from "@/lib/domain/dates"
import { describeRecurrence } from "@/lib/domain/recurrence"
import { createsCycle } from "@/lib/domain/tasks"
import { AREAS, type Priority, type Task } from "@/lib/domain/types"
import type { TaskInput } from "@/lib/validation/schemas"
import { reportError } from "@/lib/feedback"
import { useUI } from "@/lib/stores/ui"
import { cn, uid } from "@/lib/utils"
import { deleteWithUndo, duplicateWithFeedback } from "./task-actions"

type Draft = Required<Omit<TaskInput, "status">> & { status: Task["status"] }

function toDraft(t: Task | null, defaults: Partial<TaskInput> | null): Draft {
  return {
    title: t?.title ?? "",
    notes: t?.notes ?? "",
    status: t?.status ?? "todo",
    priority: t?.priority ?? 3,
    area: t?.area ?? "work",
    tags: t?.tags ?? [],
    dueDate: t?.dueDate ?? null,
    dueTime: t?.dueTime ?? null,
    reminderAt: t?.reminderAt ?? null,
    estimateMin: t?.estimateMin ?? 30,
    subtasks: t?.subtasks ?? [],
    recurrence: t?.recurrence ?? null,
    dependsOn: t?.dependsOn ?? [],
    ...(defaults as Partial<Draft>),
  }
}

/** ISO timestamp ↔ value for <input type="datetime-local"> (local time). */
function toLocalInput(iso: string | null) {
  if (!iso) return ""
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const ESTIMATES = [5, 10, 15, 25, 30, 45, 60, 90, 120, 180, 240]

export function TaskEditorDialog() {
  const { open, taskId, defaults } = useUI((s) => s.taskEditor)
  const close = useUI((s) => s.closeTaskEditor)
  const task = useTask(taskId)
  const ready = !taskId || task !== undefined

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[92dvh] gap-0 overflow-hidden rounded-dialog p-0 sm:max-w-2xl">
        {open && ready && (task === null && taskId ? (
          <div className="p-8 text-center">
            <DialogTitle>Task not found</DialogTitle>
            <DialogDescription className="mt-2">It may have been deleted.</DialogDescription>
          </div>
        ) : (
          <TaskForm key={`${taskId ?? "new"}`} task={task ?? null} defaults={defaults} onDone={close} />
        ))}
      </DialogContent>
    </Dialog>
  )
}

function TaskForm({ task, defaults, onDone }: { task: Task | null; defaults: Partial<TaskInput> | null; onDone: () => void }) {
  const [d, setD] = useState<Draft>(() => toDraft(task, defaults))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [newSub, setNewSub] = useState("")
  const allTasks = useLiveQuery(() => db.tasks.toArray(), [])
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }))

  const tagSuggestions = useMemo(() => [...new Set((allTasks ?? []).flatMap((t) => t.tags))].sort(), [allTasks])
  const byId = useMemo(() => new Map((allTasks ?? []).map((t) => [t.id, t])), [allTasks])
  const depCandidates = useMemo(
    () => (allTasks ?? []).filter((t) => t.id !== task?.id && t.status !== "done" && !d.dependsOn.includes(t.id)),
    [allTasks, task, d.dependsOn],
  )

  const save = async () => {
    setSaving(true)
    setErrors({})
    try {
      const payload: TaskInput = { ...d, title: d.title.trim() }
      if (task) {
        await updateTask(task.id, payload)
        toast.success("Task saved")
      } else {
        const created = await createTask(payload)
        toast.success("Task created", { description: created.title })
      }
      onDone()
    } catch (e) {
      if (e instanceof ValidationError) setErrors(e.fields)
      else reportError(e)
    } finally {
      setSaving(false)
    }
  }

  const addSubtask = () => {
    const title = newSub.trim()
    if (!title) return
    set("subtasks", [...d.subtasks, { id: uid("s_"), title, done: false }])
    setNewSub("")
  }

  const rec = d.recurrence
  return (
    <form
      className="flex max-h-[92dvh] flex-col"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          void save()
        }
      }}
    >
      <DialogHeader className="border-b border-line px-6 pt-6 pb-4">
        <DialogTitle>{task ? "Edit task" : "New task"}</DialogTitle>
        <DialogDescription>{task ? "Changes save when you press Save." : "Only the title is required."}</DialogDescription>
      </DialogHeader>

      <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
        <Field label="Title" htmlFor="task-title" error={errors.title}>
          <Input
            id="task-title"
            autoFocus={!task}
            value={d.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="What needs doing?"
            className="h-11 rounded-xl text-base"
            aria-invalid={!!errors.title}
            maxLength={200}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Priority">
            <Segmented<Priority>
              ariaLabel="Priority"
              value={d.priority}
              onChange={(v) => set("priority", v)}
              options={([1, 2, 3, 4] as Priority[]).map((p) => ({ value: p, label: <PriorityFlag priority={p} showLabel />, title: PRIORITY_META[p].label }))}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status" htmlFor="task-status">
              <Select value={d.status} onValueChange={(v) => set("status", v as Task["status"])}>
                <SelectTrigger id="task-status" className="h-10 w-full rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">To do</SelectItem>
                  <SelectItem value="in_progress">In progress</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Area" htmlFor="task-area">
              <Select value={d.area} onValueChange={(v) => set("area", v as Task["area"])}>
                <SelectTrigger id="task-area" className="h-10 w-full rounded-xl">
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
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Due date" htmlFor="task-due" error={errors.dueDate}>
            <DatePicker id="task-due" value={d.dueDate} onChange={(v) => set("dueDate", v)} />
          </Field>
          <Field label="Due time (optional)" htmlFor="task-time" error={errors.dueTime}>
            <Input id="task-time" type="time" value={d.dueTime ?? ""} onChange={(e) => set("dueTime", e.target.value || null)} className="h-10 rounded-xl" />
          </Field>
          <Field label="Estimate" htmlFor="task-est" error={errors.estimateMin}>
            <Select value={String(d.estimateMin)} onValueChange={(v) => set("estimateMin", Number(v))}>
              <SelectTrigger id="task-est" className="h-10 w-full rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[...new Set([...ESTIMATES, d.estimateMin])].sort((a, b) => a - b).map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {m < 60 ? `${m} min` : `${m / 60} h`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Reminder" htmlFor="task-reminder" error={errors.reminderAt} hint="Reminders fire while LIFE OS is open in a browser tab.">
            <Input
              id="task-reminder"
              type="datetime-local"
              value={toLocalInput(d.reminderAt)}
              onChange={(e) => set("reminderAt", e.target.value ? new Date(e.target.value).toISOString() : null)}
              className="h-10 rounded-xl"
            />
          </Field>
          <Field label="Tags" htmlFor="task-tags" error={errors.tags}>
            <TagInput id="task-tags" value={d.tags} onChange={(v) => set("tags", v)} suggestions={tagSuggestions} />
          </Field>
        </div>

        <Field label="Repeat" error={errors["recurrence.interval"] ?? errors.recurrence}>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Segmented<string>
                ariaLabel="Repeat"
                value={rec?.freq ?? "none"}
                onChange={(v) => set("recurrence", v === "none" ? null : { freq: v as "daily" | "weekly" | "monthly", interval: rec?.interval ?? 1, weekdays: v === "weekly" ? (rec?.weekdays ?? []) : undefined })}
                options={[
                  { value: "none", label: "Never" },
                  { value: "daily", label: "Daily" },
                  { value: "weekly", label: "Weekly" },
                  { value: "monthly", label: "Monthly" },
                ]}
              />
              {rec && (
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  every
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={rec.interval}
                    onChange={(e) => set("recurrence", { ...rec, interval: Math.max(1, Number(e.target.value) || 1) })}
                    className="h-8 w-16 rounded-lg"
                    aria-label="Repeat interval"
                  />
                  {rec.freq === "daily" ? "day(s)" : rec.freq === "weekly" ? "week(s)" : "month(s)"}
                </label>
              )}
            </div>
            {rec?.freq === "weekly" && (
              <div className="flex flex-wrap gap-1" role="group" aria-label="Repeat on weekdays">
                {WEEKDAY_SHORT.map((name, i) => {
                  const on = rec.weekdays?.includes(i)
                  return (
                    <button
                      key={name}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set("recurrence", { ...rec, weekdays: on ? rec.weekdays!.filter((x) => x !== i) : [...(rec.weekdays ?? []), i] })}
                      className={cn("h-8 w-11 rounded-full border text-xs font-medium transition-colors", on ? "border-violet bg-violet/15 text-violet" : "border-line text-muted-foreground hover:text-foreground")}
                    >
                      {name}
                    </button>
                  )
                })}
              </div>
            )}
            {rec && <p className="text-xs text-muted-foreground">{describeRecurrence(rec)}. Completing it creates the next one.</p>}
          </div>
        </Field>

        <Field label={`Subtasks${d.subtasks.length ? ` · ${d.subtasks.filter((s) => s.done).length}/${d.subtasks.length}` : ""}`}>
          <div className="space-y-1.5">
            {d.subtasks.map((s, i) => (
              <div key={s.id} className="group flex items-center gap-2 rounded-xl border border-line bg-surface-2/50 px-3 py-1.5">
                <Checkbox
                  checked={s.done}
                  onCheckedChange={(v) => set("subtasks", d.subtasks.map((x, j) => (j === i ? { ...x, done: !!v } : x)))}
                  aria-label={`Mark "${s.title}" done`}
                />
                <input
                  value={s.title}
                  onChange={(e) => set("subtasks", d.subtasks.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                  className={cn("flex-1 bg-transparent text-sm outline-none", s.done && "text-muted-foreground line-through")}
                  aria-label="Subtask title"
                  maxLength={200}
                />
                <button type="button" aria-label="Remove subtask" onClick={() => set("subtasks", d.subtasks.filter((_, j) => j !== i))} className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100">
                  <X className="size-4" />
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <Input
                value={newSub}
                onChange={(e) => setNewSub(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    addSubtask()
                  }
                }}
                placeholder="Add a subtask and press Enter"
                className="h-9 rounded-xl"
                maxLength={200}
              />
              <Button type="button" variant="secondary" size="icon" onClick={addSubtask} aria-label="Add subtask">
                <Plus />
              </Button>
            </div>
            {Object.entries(errors).find(([k]) => k.startsWith("subtasks")) && <p className="text-xs text-destructive">Every subtask needs a title.</p>}
          </div>
        </Field>

        <Field label="Waiting on" error={errors.dependsOn} hint="This task can't be completed until these are done.">
          <div className="flex flex-wrap items-center gap-1.5">
            {d.dependsOn.map((id) => {
              const dep = byId.get(id)
              return (
                <span key={id} className="inline-flex items-center gap-1.5 rounded-control border border-line bg-surface-2 py-1 pr-1 pl-2.5 text-xs">
                  {dep?.status === "done" ? <Check className="size-3 text-mint" /> : <Lock className="size-3 text-amber" />}
                  <span className="max-w-48 truncate">{dep?.title ?? "Deleted task"}</span>
                  <button type="button" aria-label="Remove dependency" onClick={() => set("dependsOn", d.dependsOn.filter((x) => x !== id))} className="grid size-5 place-items-center rounded-full hover:bg-surface-3">
                    <X className="size-3" />
                  </button>
                </span>
              )
            })}
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" size="sm" disabled={!depCandidates.length}>
                  <Link2 /> Add prerequisite
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0" align="start">
                <Command>
                  <CommandInput placeholder="Find a task…" />
                  <CommandList>
                    <CommandEmpty>No matching open tasks</CommandEmpty>
                    <CommandGroup>
                      {depCandidates.map((t) => {
                        const cycle = task ? createsCycle(task.id, t.id, byId) : false
                        return (
                          <CommandItem key={t.id} value={t.title} disabled={cycle} onSelect={() => set("dependsOn", [...d.dependsOn, t.id])}>
                            <span className="truncate">{t.title}</span>
                            {cycle && <span className="ml-auto text-[11px] text-muted-foreground">would loop</span>}
                          </CommandItem>
                        )
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </Field>

        <Field label="Notes" htmlFor="task-notes" error={errors.notes}>
          <Textarea id="task-notes" value={d.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Context, links, acceptance criteria…" className="min-h-24 rounded-xl" maxLength={5000} />
        </Field>
      </div>

      <DialogFooter className="flex-row items-center gap-2 border-t border-line bg-surface-2/40 px-6 py-4 sm:justify-between">
        <div className="flex gap-1">
          {task && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => {
                  onDone()
                  void deleteWithUndo([task.id])
                }}
              >
                <Trash2 /> Delete
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  onDone()
                  void duplicateWithFeedback(task.id)
                }}
              >
                <Copy /> Duplicate
              </Button>
            </>
          )}
        </div>
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {task ? "Save" : "Create task"}
          </Button>
        </div>
      </DialogFooter>
    </form>
  )
}
