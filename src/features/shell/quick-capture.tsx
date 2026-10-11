"use client"

import { CalendarDays, Clock, Hash, Zap } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AreaBadge, Chip, Kbd, PriorityFlag } from "@/components/os/visuals"
import { createTask } from "@/lib/db/repo"
import { parseCapture } from "@/lib/domain/capture"
import { formatDuration, relativeDayLabel } from "@/lib/domain/dates"
import { attempt } from "@/lib/feedback"
import { useToday } from "@/lib/db/hooks"
import { useUI } from "@/lib/stores/ui"

export function QuickCapture() {
  const open = useUI((s) => s.captureOpen)
  const setOpen = useUI((s) => s.setCapture)
  const openTaskEditor = useUI((s) => s.openTaskEditor)
  const today = useToday()
  const [text, setText] = useState("")
  const parsed = useMemo(() => parseCapture(text, today), [text, today])

  const save = async (keepOpen: boolean) => {
    if (!parsed.title) {
      toast.error("Add a few words describing the task")
      return
    }
    const task = await attempt(() =>
      createTask({
        title: parsed.title,
        priority: parsed.priority ?? 3,
        tags: parsed.tags,
        dueDate: parsed.dueDate,
        estimateMin: parsed.estimateMin ?? 30,
        area: parsed.area ?? "work",
      }),
    )
    if (!task) return
    toast.success("Captured", {
      description: task.title,
      action: { label: "Edit", onClick: () => openTaskEditor(task.id) },
    })
    setText("")
    if (!keepOpen) setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setText("")
      }}
    >
      <DialogContent className="top-[22%] translate-y-0 gap-0 rounded-dialog p-0 sm:max-w-xl">
        <DialogHeader className="sr-only">
          <DialogTitle>Quick capture</DialogTitle>
          <DialogDescription>Type a task. Add tomorrow, !1, #tag, @study or 30m to fill in details.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void save(false)
          }}
        >
          <div className="flex items-center gap-3 px-5 pt-5">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-violet/15 text-violet">
              <Zap className="size-4" />
            </span>
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.shiftKey) {
                  e.preventDefault()
                  void save(true)
                }
              }}
              placeholder="Revise cardiac cycle tomorrow !1 #exam @study 45m"
              className="h-11 w-full bg-transparent text-[1.05rem] outline-none placeholder:text-muted-foreground/60"
              aria-label="Task to capture"
              maxLength={240}
            />
          </div>
          <div className="flex min-h-12 flex-wrap items-center gap-1.5 px-5 py-3">
            {parsed.dueDate && <Chip icon={CalendarDays}>{relativeDayLabel(parsed.dueDate, today)}</Chip>}
            {parsed.priority && <Chip><PriorityFlag priority={parsed.priority} showLabel /></Chip>}
            {parsed.area && <AreaBadge area={parsed.area} />}
            {parsed.estimateMin && <Chip icon={Clock}>{formatDuration(parsed.estimateMin)}</Chip>}
            {parsed.tags.map((t) => (
              <Chip key={t} icon={Hash}>
                {t}
              </Chip>
            ))}
            {!parsed.dueDate && !parsed.priority && !parsed.area && !parsed.estimateMin && !parsed.tags.length && (
              <span className="text-xs text-muted-foreground">
                Try <code className="text-foreground">tomorrow</code>, <code className="text-foreground">fri</code>, <code className="text-foreground">!1</code>, <code className="text-foreground">#tag</code>,{" "}
                <code className="text-foreground">@health</code>, <code className="text-foreground">30m</code>
              </span>
            )}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
            <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
              <Kbd>Enter</Kbd> save <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> save &amp; add another
            </span>
            <Button type="submit" disabled={!parsed.title} className="ml-auto">
              Capture
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
