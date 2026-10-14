"use client"

import { CalendarArrowUp, Check, RotateCcw, Trash2 } from "lucide-react"
import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import { toast } from "sonner"
import { updateTask } from "@/lib/db/repo"
import { addDays } from "@/lib/domain/dates"
import type { Task } from "@/lib/domain/types"
import { attempt } from "@/lib/feedback"
import { cn } from "@/lib/utils"
import { deleteWithUndo, toggleDone } from "./task-actions"

const DONE_AT = 96 // px right: complete (or reopen)
const LATER_AT = 80 // px left: move to tomorrow
const DELETE_AT = 170 // px left: delete
const MAX = 220

type Action = "done" | "later" | "delete" | null
const actionAt = (dx: number): Action => (dx >= DONE_AT ? "done" : dx <= -DELETE_AT ? "delete" : dx <= -LATER_AT ? "later" : null)

/**
 * On a touch screen, swipe a task right to complete it (or reopen it), left to move it to
 * tomorrow, or further left to delete it. What will happen shows underneath as you swipe,
 * with a buzz as you cross into it, and each has Undo. Up-and-down still scrolls, a tap
 * still opens the task, and a mouse is left alone.
 */
export function SwipeRow({ task, today, children }: { task: Task; today: string; children: ReactNode }) {
  const row = useRef<HTMLDivElement>(null)
  const gesture = useRef<{ id: number; x: number; y: number; engaged: boolean; action: Action } | null>(null)
  const swallowClick = useRef(false)
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const done = task.status === "done"

  const reset = () => {
    gesture.current = null
    setDragging(false)
    setDx(0)
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "touch" || (e.target as Element).closest('[aria-label="Drag to reorder"]')) return
    gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, engaged: false, action: null }
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    if (!g || g.id !== e.pointerId) return
    const mx = e.clientX - g.x
    const my = e.clientY - g.y
    if (!g.engaged) {
      // mostly up or down: it's a scroll, not a swipe
      if (Math.abs(my) > 10 && Math.abs(my) >= Math.abs(mx)) return reset()
      if (Math.abs(mx) < 12 || Math.abs(mx) < Math.abs(my) * 1.5) return
      g.engaged = true
      setDragging(true)
      try {
        row.current?.setPointerCapture(e.pointerId)
      } catch {
        // the finger already lifted
      }
    }
    // a little resistance past the last threshold
    const reach = mx > 0 ? DONE_AT + 40 : DELETE_AT + 20
    const eased = Math.abs(mx) <= reach ? mx : Math.sign(mx) * (reach + (Math.abs(mx) - reach) * 0.3)
    const next = Math.max(-MAX, Math.min(MAX, eased))
    const action = actionAt(next)
    if (action !== g.action) {
      if (action) navigator.vibrate?.(8)
      g.action = action
    }
    setDx(next)
  }
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    if (!g || g.id !== e.pointerId) return
    if (!g.engaged) {
      gesture.current = null
      return
    }
    swallowClick.current = true
    setTimeout(() => (swallowClick.current = false), 0)
    const action = g.action
    reset()
    if (action === "done") void toggleDone(task)
    else if (action === "delete") void deleteWithUndo([task.id])
    else if (action === "later") void moveToTomorrow(task, today)
  }

  const action = actionAt(dx)
  const right = dx > 0
  return (
    <div className="relative">
      {dx !== 0 && (
        <div
          aria-hidden
          className={cn(
            "absolute inset-0 flex items-center rounded-2xl px-5 text-sm font-semibold transition-colors",
            right ? "justify-start" : "justify-end",
            right ? (action === "done" ? "bg-mint/80 text-primary-foreground" : "bg-mint/25") : action === "delete" ? "bg-rose/80 text-primary-foreground" : action === "later" ? "bg-amber/80 text-primary-foreground" : "bg-amber/25",
          )}
        >
          {right ? (
            <span className="flex items-center gap-2">
              {done ? <RotateCcw className="size-4" /> : <Check className="size-4" />} {done ? "Reopen" : "Done"}
            </span>
          ) : (
            <span className="flex items-center gap-2">
              {action === "delete" ? (
                <>
                  Delete <Trash2 className="size-4" />
                </>
              ) : (
                <>
                  Tomorrow <CalendarArrowUp className="size-4" />
                </>
              )}
            </span>
          )}
        </div>
      )}
      <div
        ref={row}
        className={cn("relative touch-pan-y rounded-2xl", dx !== 0 && "bg-popover")}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: dragging ? "none" : "transform 0.25s var(--ease-out), background-color 0.25s" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={reset}
        onClickCapture={(e) => {
          if (!swallowClick.current) return
          e.preventDefault()
          e.stopPropagation()
        }}
      >
        {children}
      </div>
    </div>
  )
}

async function moveToTomorrow(task: Task, today: string) {
  const previous = task.dueDate
  const tomorrow = addDays(today, 1)
  if (!(await attempt(() => updateTask(task.id, { dueDate: tomorrow })))) return
  toast("Moved to tomorrow", { description: task.title, action: { label: "Undo", onClick: () => void attempt(() => updateTask(task.id, { dueDate: previous })) } })
}
