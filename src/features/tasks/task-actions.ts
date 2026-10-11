"use client"

import { toast } from "sonner"
import { deleteTasks, duplicateTask, restoreTasks, toggleTaskDone } from "@/lib/db/repo"
import { formatDay } from "@/lib/domain/dates"
import type { ID, Task } from "@/lib/domain/types"
import { attempt } from "@/lib/feedback"

export async function toggleDone(task: Task) {
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
