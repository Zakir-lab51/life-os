"use client"

import { useSyncExternalStore } from "react"
import { toast } from "sonner"
import { deleteTasks, duplicateTask, restoreTasks, toggleTaskDone } from "@/lib/db/repo"
import { formatDay } from "@/lib/domain/dates"
import type { ID, Task } from "@/lib/domain/types"
import { attempt } from "@/lib/feedback"

/*
  Tasks completed a moment ago. A list may rebuild a task's row when it's ticked (open
  and done tasks are often listed apart), so the tick's pop can't rely on the row
  noticing the change; rows ask here instead.
*/
const justCompleted = new Map<ID, number>()
const POP_FOR = 1000 // ms

/** Whether `id` was completed in the last moment, so its tick-box should pop. */
export function wasJustCompleted(id: ID): boolean {
  const at = justCompleted.get(id)
  return at !== undefined && performance.now() - at < POP_FOR
}

/*
  A task just ticked keeps its place while the line is drawn through it, then glides to
  the finished ones: lists treat the tasks in useSettling() as still open until then.
  Not with reduced motion: there it moves at once.
*/
const HOLD_FOR = 520 // ms, a little longer than the line takes to draw
const NONE: ReadonlySet<ID> = new Set()
let settling: ReadonlySet<ID> = NONE
const listeners = new Set<() => void>()
const setSettling = (next: ReadonlySet<ID>) => {
  settling = next
  for (const l of listeners) l()
}
const settle = (id: ID) => {
  if (!settling.has(id)) return
  const next = new Set(settling)
  next.delete(id)
  setSettling(next)
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
const reducedMotion = () =>
  typeof document !== "undefined" && (document.documentElement.dataset.motion === "reduced" || matchMedia("(prefers-reduced-motion: reduce)").matches)

/** Whether `id` was ticked a moment ago and should still sit where it was. */
export function isSettling(id: ID): boolean {
  return settling.has(id)
}

/** Tasks ticked a moment ago that should still sit where they were. */
export function useSettling(): ReadonlySet<ID> {
  return useSyncExternalStore(subscribe, () => settling, () => NONE)
}

export async function toggleDone(task: Task) {
  // noted before the write, so the first render of the finished task already sees it
  if (task.status !== "done") {
    justCompleted.set(task.id, performance.now())
    if (!reducedMotion()) {
      setSettling(new Set(settling).add(task.id))
      setTimeout(() => settle(task.id), HOLD_FOR)
    }
  } else settle(task.id)
  const result = await attempt(() => toggleTaskDone(task.id))
  if (result === undefined) {
    settle(task.id)
    return
  }
  if (task.status !== "done" && result && typeof result === "object" && "next" in result && result.next?.dueDate) {
    toast.success("Done", { description: `Next "${task.title}" is due ${formatDay(result.next.dueDate)}.` })
  }
}

export async function deleteWithUndo(ids: ID[]) {
  const snapshot = await attempt(() => deleteTasks(ids))
  if (!snapshot?.length) return
  toast(snapshot.length === 1 ? `Deleted "${snapshot[0].title}"` : `Deleted ${snapshot.length} tasks`, {
    action: {
      label: "Undo",
      onClick: () => void attempt(() => restoreTasks(snapshot)),
    },
    duration: 8000,
  })
}

export async function duplicateWithFeedback(id: ID) {
  const copy = await attempt(() => duplicateTask(id))
  if (copy) toast.success("Duplicated", { description: copy.title })
  return copy
}
