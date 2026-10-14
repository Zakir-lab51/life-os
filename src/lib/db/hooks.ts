"use client"

import { useLiveQuery } from "dexie-react-hooks"
import { createContext, createElement, useContext, useSyncExternalStore, type ReactNode } from "react"
import { db } from "./db"
import { migratePrefs } from "./defaults"
import { todayISO } from "@/lib/domain/dates"
import type { ISODate } from "@/lib/domain/types"
import type { LifeData } from "@/lib/domain/scores"

async function readLifeData(): Promise<LifeData> {
  const [tasks, habits, habitLogs, sessions, reflections, goals, goalLogs] = await Promise.all([
    db.tasks.toArray(),
    db.habits.orderBy("order").toArray(),
    db.habitLogs.toArray(),
    db.focusSessions.toArray(),
    db.reflections.toArray(),
    db.goals.orderBy("order").toArray(),
    db.goalLogs.toArray(),
  ])
  return { tasks, habits, habitLogs, sessions, reflections, goals, goalLogs }
}

/** `null`: no provider above (each caller reads for itself); `undefined`: still loading. */
const SharedLifeData = createContext<LifeData | undefined | null>(null)

/**
 * One live read of everything for the whole app. Before, every part of the screen that
 * needed it (top bar, sidebar, engines, the page) read all seven tables again after every
 * change, which grows with your history; now they share this one, and the same objects.
 */
export function LifeDataProvider({ children }: { children: ReactNode }) {
  const data = useLiveQuery(readLifeData, [])
  return createElement(SharedLifeData.Provider, { value: data }, children)
}

/**
 * Every module reads from the same live data, so finishing a task, a habit or a focus
 * session updates the dashboard, analytics and XP everywhere at once.
 */
export function useLifeData(): LifeData | undefined {
  const shared = useContext(SharedLifeData)
  const own = useLiveQuery(() => (shared === null ? readLifeData() : undefined), [shared === null])
  return shared === null ? own : shared
}

export function usePrefs() {
  return useLiveQuery(async () => {
    const p = await db.prefs.get("prefs")
    return p ? migratePrefs(p) : undefined
  }, [])
}

/**
 * A live query keyed by its inputs. While a new key is loading, useLiveQuery
 * keeps returning the previous result; this returns `undefined` instead, so a
 * screen never shows (or plans against) another day's data.
 */
function useKeyedQuery<T>(key: string, query: () => Promise<T>): T | undefined {
  const result = useLiveQuery(async () => ({ key, value: await query() }), [key])
  return result && result.key === key ? result.value : undefined
}

/** One record for an editor: `undefined` while loading, `null` if it doesn't exist (or no id). */
export function useTask(id: string | null) {
  return useKeyedQuery(`task:${id}`, async () => (id ? ((await db.tasks.get(id)) ?? null) : null))
}

export function useGoal(id: string | null) {
  return useKeyedQuery(`goal:${id}`, async () => (id ? ((await db.goals.get(id)) ?? null) : null))
}

export function useHabit(id: string | null) {
  return useKeyedQuery(`habit:${id}`, async () => (id ? ((await db.habits.get(id)) ?? null) : null))
}

export function useBlock(id: string | null) {
  return useKeyedQuery(`block:${id}`, async () => (id ? ((await db.blocks.get(id)) ?? null) : null))
}

export function useBlocks(date: ISODate) {
  return useKeyedQuery(`blocks:${date}`, () => db.blocks.where("date").equals(date).sortBy("start"))
}

export function useBlocksBetween(from: ISODate, to: ISODate) {
  return useKeyedQuery(`blocks:${from}:${to}`, () => db.blocks.where("date").between(from, to, true, true).toArray())
}

export function useNotifications() {
  return useLiveQuery(() => db.notifications.orderBy("at").reverse().limit(60).toArray(), [])
}

export function useRoutineChecks(date: ISODate) {
  return useKeyedQuery(`routines:${date}`, () => db.routineChecks.where("date").equals(date).toArray())
}

export function useReflection(date: ISODate) {
  return useKeyedQuery(`reflection:${date}`, async () => (await db.reflections.get(date)) ?? null)
}

export function useUnlocks() {
  return useLiveQuery(() => db.achievements.toArray(), [])
}

export function useActivity(limit = 30) {
  return useLiveQuery(() => db.activity.orderBy("at").reverse().limit(limit).toArray(), [limit])
}

/* ── one shared clock for the whole app ─────────────── */

const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | undefined

function subscribeClock(cb: () => void) {
  listeners.add(cb)
  if (!timer) timer = setInterval(() => listeners.forEach((l) => l()), 1000)
  const onVisible = () => cb()
  document.addEventListener("visibilitychange", onVisible)
  return () => {
    listeners.delete(cb)
    document.removeEventListener("visibilitychange", onVisible)
    if (!listeners.size && timer) {
      clearInterval(timer)
      timer = undefined
    }
  }
}

/** Current time, rounded down to `resolutionMs` so components only re-render when it changes. */
export function useNow(resolutionMs = 60_000): number {
  return useSyncExternalStore(
    subscribeClock,
    () => Math.floor(Date.now() / resolutionMs) * resolutionMs,
    () => 0,
  )
}

/** Today's date; rolls over at midnight. */
export function useToday(): ISODate {
  const now = useNow(60_000)
  return todayISO(new Date(now))
}
