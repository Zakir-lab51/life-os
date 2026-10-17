import { BACKUP_VERSION, BackupError } from "./backup"
import { backupSchema, fieldErrors, type Backup } from "@/lib/validation/schemas"

/*
  Reading a backup file needs the validation rules (zod); it's kept apart from the rest of
  backup.ts, which every page loads (Download a backup is in the command palette), so
  those rules load only when a backup is actually opened.
*/

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
