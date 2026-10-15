import { BACKUP_TABLES, db } from "./db"
import { backupSchema, fieldErrors, type Backup } from "@/lib/validation/schemas"
import { AREA_META, PRIORITY_META } from "@/lib/domain/areas"
import { describeRecurrence } from "@/lib/domain/recurrence"

export const BACKUP_VERSION = 1

export async function exportBackup(): Promise<Backup> {
  const data = {} as Backup["data"]
  await db.transaction("r", BACKUP_TABLES.map((t) => db.table(t)), async () => {
    for (const name of BACKUP_TABLES) {
      ;(data as Record<string, unknown[]>)[name] = await db.table(name).toArray()
    }
  })
  return { app: "life-os", version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data }
}

export class BackupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BackupError"
  }
}

/** Parses and validates a backup file without touching the database. */
export function parseBackup(text: string): Backup {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new BackupError("That file isn't valid JSON.")
  }
  const parsed = backupSchema.safeParse(json)
  if (!parsed.success) {
    const [path, message] = Object.entries(fieldErrors(parsed.error))[0] ?? ["", "Unknown problem"]
    throw new BackupError(`This doesn't look like a LIFE OS backup (${path}: ${message}).`)
  }
  if (parsed.data.version > BACKUP_VERSION) {
    throw new BackupError("This backup was made by a newer version of LIFE OS.")
  }
  return parsed.data
}

export function backupCounts(b: Backup) {
  return {
    tasks: b.data.tasks.length,
    habits: b.data.habits.length,
    checkIns: b.data.habitLogs.length,
    focusSessions: b.data.focusSessions.length,
    blocks: b.data.blocks.length,
    reflections: b.data.reflections.length,
    goals: b.data.goals.length,
    projects: b.data.projects.length,
  }
}

/** Replaces all stored data with the backup, in one transaction: it either fully succeeds or changes nothing. */
export async function restoreBackup(b: Backup) {
  await db.transaction("rw", [...BACKUP_TABLES.map((t) => db.table(t)), db.notifications], async () => {
    for (const name of BACKUP_TABLES) await db.table(name).clear()
    await db.notifications.clear()
    for (const name of BACKUP_TABLES) {
      const rows = (b.data as Record<string, unknown[]>)[name]
      if (rows.length) await db.table(name).bulkAdd(rows)
    }
  })
}

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value)
  // guard against spreadsheet formula injection
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export async function exportTasksCSV(): Promise<string> {
  const tasks = await db.tasks.toArray()
  const header = ["Title", "Status", "Priority", "Area", "Due date", "Due time", "Estimate (min)", "Tags", "Repeats", "Subtasks done", "Completed at", "Created at", "Notes"]
  const rows = tasks.map((t) => [
    t.title,
    t.status,
    PRIORITY_META[t.priority].label,
    AREA_META[t.area].label,
    t.dueDate ?? "",
    t.dueTime ?? "",
    t.estimateMin,
    t.tags.join(" "),
    t.recurrence ? describeRecurrence(t.recurrence) : "",
    t.subtasks.length ? `${t.subtasks.filter((s) => s.done).length}/${t.subtasks.length}` : "",
    t.completedAt ?? "",
    t.createdAt,
    t.notes,
  ])
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n")
}

/** Triggers a browser download of generated content. */
export function downloadText(filename: string, content: string, type = "application/json") {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
