/*
  Sync across devices, through Dexie Cloud (https://dexie.org/cloud): optional, off until
  you turn it on in Settings → Data & backup.

  A device that syncs keeps its synced data in a separate local database (Dexie Cloud names
  it after the cloud database), so turning sync on never touches the data the device had on
  its own: that stays in the "life-os" database, and is where it goes back to if you stop.
  When you turn sync on you say where to start from:
    "this-device": copy this device's data into your account (do this on one device)
    "account":     use what's already in your account (on every other device)
  Until signing in and the first download have finished ("ready"), the app doesn't start,
  so a fresh device can't write default settings over the ones in your account.
*/

/** The Dexie Cloud database (from `npx dexie-cloud create`; empty turns sync off everywhere). Not a secret: every browser needs it. */
export const CLOUD_DATABASE_URL: string = "https://z3eeriuky.dexie.cloud"

export const syncAvailable = CLOUD_DATABASE_URL !== ""

export type SyncStart = "this-device" | "account"
export interface SyncSetting {
  start: SyncStart
  /** signed in, first download done, and this device's data copied up if asked */
  ready: boolean
}

const KEY = "life-os.sync"

export function readSync(): SyncSetting | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as SyncSetting
    return s.start === "this-device" || s.start === "account" ? s : null
  } catch {
    return null
  }
}

export function writeSync(s: SyncSetting | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s))
    else localStorage.removeItem(KEY)
  } catch {
    // storage blocked: sync stays off
  }
}
