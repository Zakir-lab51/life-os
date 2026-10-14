import { readSync, writeSync, type SyncStart } from "@/lib/db/cloud"
import { BACKUP_TABLES, db, openOwnData, type LifeDB } from "@/lib/db/db"

/** Everything that moves between this device's own data and the synced copy (notifications stay on the device either way). */
const TABLES = [...BACKUP_TABLES, "notifications"] as const

/** Turns sync on for this device: the app reloads into the synced database and asks you to sign in. */
export function turnOnSync(start: SyncStart) {
  writeSync({ start, ready: false })
  window.location.reload()
}

/** Gives up setting sync up, back to this device's own data (which was never touched). */
export function cancelSync() {
  writeSync(null)
  window.location.reload()
}

/** Copies every table from one database to another, adding to (or, with `replace`, replacing) what's there. The source isn't changed. */
export async function copyTables(from: LifeDB, to: LifeDB, replace: boolean) {
  await from.open()
  const rows = await Promise.all(TABLES.map((t) => from.table(t).toArray()))
  await to.transaction("rw", TABLES.map((t) => to.table(t)), async () => {
    for (const [i, t] of TABLES.entries()) {
      if (replace) await to.table(t).clear()
      if (rows[i].length) await to.table(t).bulkPut(rows[i])
    }
  })
}

/** Whether the account already holds LIFE OS data (after the first download). */
async function accountHasData() {
  const [prefs, tasks, habits] = await Promise.all([db.prefs.count(), db.tasks.count(), db.habits.count()])
  return prefs + tasks + habits > 0
}

/**
 * After signing in: download what's in your account, then, if this device was chosen to
 * start from, copy its own data up. If the account already has data, `copyOwn: "ask"` stops
 * and reports it, so you can choose rather than end up with two of everything.
 */
export async function finishSetup(copyOwn: boolean | "ask"): Promise<"done" | "account-has-data"> {
  const setting = readSync()
  if (!setting) throw new Error("Sync isn't on for this device")
  await db.cloud.sync({ wait: true, purpose: "pull" })
  if (setting.start === "this-device") {
    if (copyOwn === "ask" && (await accountHasData())) return "account-has-data"
    if (copyOwn !== false) {
      const own = openOwnData()
      try {
        await copyTables(own, db, false)
      } finally {
        own.close()
      }
      await db.cloud.sync({ wait: true, purpose: "push" })
    }
  }
  writeSync({ ...setting, ready: true })
  return "done"
}

/**
 * Stops syncing on this device. It keeps everything exactly as it is now, in its own
 * database; your account (and your other devices) keep their copy.
 */
export async function stopSync() {
  const own = openOwnData()
  try {
    await copyTables(db, own, true)
  } finally {
    own.close()
  }
  try {
    await db.cloud.sync({ wait: true, purpose: "push" })
  } catch {
    // offline: anything unsent stays on this device, which keeps it all
  }
  await db.cloud.logout({ force: true })
  writeSync(null)
  window.location.reload()
}
