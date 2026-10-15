"use client"

import { CornerDownLeft, Plus } from "lucide-react"
import { useId, useMemo, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { useToday } from "@/lib/db/hooks"
import { createTask } from "@/lib/db/repo"
import { parseCapture } from "@/lib/domain/capture"
import { formatDuration, relativeDayLabel } from "@/lib/domain/dates"
import { AREA_META } from "@/lib/domain/areas"
import type { Area, ID, ISODate } from "@/lib/domain/types"
import { attempt } from "@/lib/feedback"
import { useUI } from "@/lib/stores/ui"
import { cn } from "@/lib/utils"

/**
 * Add a task in one line, as on My Day: "Revise ECG tomorrow p1 #study 45m". What it
 * understood shows underneath as you type; Enter adds it and keeps the field ready.
 * `defaultDue` dates a task typed without one (today, in the Today view). On a project's
 * page, tasks go into `projectId` and take its `area` unless they name one; `inPanel`
 * styles the hint for a glass tile rather than the backdrop.
 */
export function TaskQuickAdd({ defaultDue = null, projectId = null, area = "work", inPanel = false }: { defaultDue?: ISODate | null; projectId?: ID | null; area?: Area; inPanel?: boolean }) {
  const today = useToday()
  const hintId = useId()
  const openTaskEditor = useUI((s) => s.openTaskEditor)
  const [text, setText] = useState("")
  const parsed = useMemo(() => parseCapture(text, today), [text, today])
  const due = parsed.dueDate ?? defaultDue

  const add = async () => {
    if (!parsed.title) return
    const task = await attempt(() =>
      createTask({
        title: parsed.title,
        priority: parsed.priority ?? 3,
        tags: parsed.tags,
        dueDate: due,
        estimateMin: parsed.estimateMin ?? 30,
        area: parsed.area ?? area,
        projectId,
      }),
    )
    if (!task) return
    toast.success("Task added", { description: task.title, action: { label: "Edit", onClick: () => openTaskEditor(task.id) } })
    setText("")
  }

  const hint = !text.trim()
    ? "Try “Revise ECG tomorrow p1 #study 45m” or “Pay fees 14/10”."
    : !parsed.title
      ? "Add what the task is."
      : [
          parsed.title,
          due ? relativeDayLabel(due, today) : "No date",
          parsed.priority ? `P${parsed.priority}` : null,
          ...parsed.tags.map((t) => `#${t}`),
          parsed.area ? AREA_META[parsed.area].label : null,
          parsed.estimateMin ? formatDuration(parsed.estimateMin) : null,
        ]
          .filter(Boolean)
          .join(" · ")

  return (
    <form
      className={inPanel ? undefined : "mb-4"}
      onSubmit={(e) => {
        e.preventDefault()
        void add()
      }}
    >
      <div className="flex h-11 items-center gap-2 rounded-control border border-line bg-surface pr-1.5 pl-3.5 transition-shadow focus-within:ring-2 focus-within:ring-ring">
        <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a task: what, when, p1, #tag, 30m"
          aria-label="Add a task"
          aria-describedby={hintId}
          enterKeyHint="done"
          maxLength={200}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {text.trim() && (
          <Button type="submit" size="sm" disabled={!parsed.title} className="h-8">
            Add <CornerDownLeft className="size-3.5" />
          </Button>
        )}
      </div>
      <p id={hintId} aria-live="polite" className={cn("mt-1.5 min-h-4 truncate px-3.5 text-xs tabular", inPanel ? "text-muted-foreground" : "text-muted-backdrop on-backdrop", parsed.title && "text-foreground/80")}>
        {hint}
      </p>
    </form>
  )
}
