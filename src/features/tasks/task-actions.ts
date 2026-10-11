"use client"

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

export async function toggleDone(task: Task) {
  // noted before the write, so the first render of the finished task already sees it
  if (task.status !== "done") justCompleted.set(task.id, performance.now())
  const result = await attempt(() => toggleTaskDone(task.id))
  if (result === undefined) return
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
