import { roundUpTo } from "./dates"
import { freeSlots } from "./planner"
import type { Block, BlockKind } from "./types"

/*
  One line in, one time block out: "Gym 6pm 1h", "Revise anatomy 2-3:30pm", "Call home 20m",
  "Deep work at 14:00 for 90m". The time and length are lifted out of the words and what's
  left is the title. Without a time, the block goes in the next free gap that fits.

  Repeats: "every mon wed", "every monday and thursday", "mondays", "weekdays", "weekends",
  "daily": the block becomes a repeating one on those days.

  Times: "6pm", "6:30 pm", "18:00", "at 9", "noon", ranges like "9-10:30" or "2 to 3pm".
  A bare hour without am/pm ("at 7") is the one inside your day that hasn't passed yet. A
  bare number on its own ("Read 20 pages") is never a time. Lengths: "1h", "1.5h", "1h30",
  "45m", "90 min", "for 2 hours".
*/

export interface QuickBlock {
  title: string
  start: number
  end: number
  kind: BlockKind
  /** Whether the time was typed, or found in the next free gap. */
  placed: "typed" | "gap"
  /** Weekdays it repeats on (0 = Sunday), or null for a one-off. */
  days: number[] | null
}

export type QuickParse =
  | { ok: true; block: QuickBlock }
  | { ok: false; reason: "empty" | "no-title" | "no-gap"; title: string; minutes: number }

export interface QuickContext {
  /** Minutes after midnight, now (only used when planning today). */
  nowMin: number
  isToday: boolean
  dayStart: number
  dayEnd: number
  blocks: Pick<Block, "start" | "end">[]
}

const SUFFIX = String.raw`(am|pm|a\.m\.|p\.m\.)`
const CLOCK = String.raw`(\d{1,2})(?:[:.](\d{2}))?`
const RANGE = new RegExp(String.raw`(?:\bfrom\s+)?\b${CLOCK}\s*${SUFFIX}?\s*(?:-|–|—|\bto\b|\buntil\b|\btill\b)\s*${CLOCK}\s*${SUFFIX}?(?![\d.:])`, "i")
// a single time needs am/pm, a colon, "at"/"@", or to be noon/midnight: a bare number isn't one
const SINGLE = [
  new RegExp(String.raw`(?:\b(?:at|@)\s*)?\b${CLOCK}\s*${SUFFIX}(?!\w)`, "i"),
  new RegExp(String.raw`(?:\b(?:at|@)\s*)?\b(\d{1,2})[:.](\d{2})\b()`, "i"),
  new RegExp(String.raw`(?:\bat\b|@)\s*(\d{1,2})()()(?![\d:.]|\s*(?:h|hr|hrs|hour|hours|m|min|mins|minutes)\b)`, "i"),
]
const NAMED = /\b(?:at\s+)?(noon|midday|midnight)\b/i
const LENGTH = [
  /\b(?:for\s+)?(\d+(?:\.\d+)?)\s*(?:hours|hour|hrs|hr|h)(?![a-z])(?:\s*(\d{1,2})\s*(?:minutes|mins|min|m)?(?![a-z]))?/i,
  /\b(?:for\s+)?(\d+)\s*(?:m|min|mins|minute|minutes)\b/i,
]
// whole day names only, so "monitor" or "satellite" are never days
const DAY = String.raw`(sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?)`
const EVERY = new RegExp(String.raw`\b(?:every|each|on)\s+${DAY}\b(?:(?:\s*,\s*|\s+and\s+|\s*&\s*|\s+)${DAY}\b)*`, "i")
const PLURAL = new RegExp(String.raw`\b${DAY}s\b(?:(?:\s*,\s*|\s+and\s+|\s*&\s*|\s+)${DAY}s\b)*`, "i")
const DAY_NUMBER: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }
const daysIn = (text: string) => [...new Set([...text.toLowerCase().matchAll(new RegExp(DAY, "g"))].map((m) => DAY_NUMBER[m[1].slice(0, 3)]))].sort()

/** Takes a repeat ("every mon wed", "weekdays", "daily") out of the text. */
function takeRepeat(text: string): { rest: string; days: number[] | null } {
  const named: [RegExp, number[]][] = [
    [/\b(?:daily|every\s*day|each\s+day)\b/i, [0, 1, 2, 3, 4, 5, 6]],
    [/\b(?:every\s+weekday|(?:on\s+)?weekdays)\b/i, [1, 2, 3, 4, 5]],
    [/\b(?:every\s+weekend|(?:on\s+)?weekends)\b/i, [0, 6]],
  ]
  for (const [re, days] of named) {
    const hit = re.exec(text)
    if (hit) return { rest: text.replace(hit[0], " "), days }
  }
  for (const re of [EVERY, PLURAL]) {
    const hit = re.exec(text)
    // "on monday" alone is a day, not a repeat; "on mondays" or "every monday" is
    if (hit && (re === PLURAL || !/^on\s/i.test(hit[0]))) return { rest: text.replace(hit[0], " "), days: daysIn(hit[0]) }
  }
  return { rest: text, days: null }
}

const KINDS: [RegExp, BlockKind][] = [
  [/\b(deep work|focus|study|revise|revision|practice|write|writing|code|coding|read|reading)\b/i, "focus"],
  [/\b(break|lunch|breakfast|dinner|coffee|tea|nap|rest|walk)\b/i, "break"],
]

const isPm = (s?: string) => !!s && s.toLowerCase().startsWith("p")

/** Minutes after midnight for an hour/minute and optional am/pm, choosing am or pm sensibly when it's missing. */
function resolve(h: number, m: number, suffix: string | undefined, ctx: QuickContext): number | null {
  if (h > 23 || m > 59) return null
  if (suffix) return ((h % 12) + (isPm(suffix) ? 12 : 0)) * 60 + m
  if (h === 0 || h > 12) return h * 60 + m
  const options = h === 12 ? [12 * 60 + m] : [h * 60 + m, (h + 12) * 60 + m]
  const inDay = (t: number) => t >= ctx.dayStart && t < ctx.dayEnd
  const ahead = (t: number) => !ctx.isToday || t >= ctx.nowMin - 30
  return options.find((t) => inDay(t) && ahead(t)) ?? options.find(inDay) ?? options[0]
}

const tidy = (s: string) =>
  s
    .replace(/\s+/g, " ")
    .replace(/^(?:\s|at\b|@|for\b|from\b|[-–—,·])+/i, "")
    .replace(/(?:\s|\bat|@|\bfor|\bfrom|[-–—,·])+$/i, "")
    .trim()

export function parseQuickBlock(text: string, ctx: QuickContext): QuickParse {
  if (!text.trim()) return { ok: false, reason: "empty", title: "", minutes: 0 }
  const repeat = takeRepeat(` ${text.trim()} `)
  let rest = repeat.rest
  let start: number | null = null
  let end: number | null = null
  let length: number | null = null

  const range = RANGE.exec(rest)
  if (range) {
    const [, h1, m1, s1, h2, m2, s2] = range
    // "2-3:30pm": the start borrows the end's am/pm, as people mean it
    const startSuffix = s1 ?? (s2 && Number(h1) <= Number(h2) ? s2 : undefined)
    const a = resolve(Number(h1), Number(m1 ?? 0), startSuffix, ctx)
    let b = resolve(Number(h2), Number(m2 ?? 0), s2, ctx)
    if (a !== null && b !== null) {
      if (b <= a && !s2 && b + 12 * 60 <= 24 * 60) b += 12 * 60
      if (b > a) {
        start = a
        end = b
        rest = rest.replace(range[0], " ")
      }
    }
  }
  if (start === null) {
    for (const re of SINGLE) {
      const hit = re.exec(rest)
      if (!hit) continue
      const t = resolve(Number(hit[1]), Number(hit[2] || 0), hit[3] || undefined, ctx)
      if (t === null) continue
      start = t
      rest = rest.replace(hit[0], " ")
      break
    }
  }
  if (start === null) {
    const named = NAMED.exec(rest)
    if (named) {
      start = named[1].toLowerCase() === "midnight" ? 0 : 12 * 60
      rest = rest.replace(named[0], " ")
    }
  }
  if (end === null) {
    for (const re of LENGTH) {
      const hit = re.exec(rest)
      if (!hit) continue
      length = re === LENGTH[0] ? Math.round(Number(hit[1]) * 60) + Number(hit[2] ?? 0) : Number(hit[1])
      rest = rest.replace(hit[0], " ")
      break
    }
  }

  const title = tidy(rest)
  const kind = KINDS.find(([re]) => re.test(title))?.[1] ?? "event"
  const minutes = end !== null && start !== null ? end - start : Math.max(5, Math.min(12 * 60, length ?? (kind === "focus" ? 60 : 30)))
  if (!title) return { ok: false, reason: "no-title", title, minutes }

  if (start === null) {
    const from = ctx.isToday ? Math.max(ctx.dayStart, roundUpTo(ctx.nowMin, 15)) : ctx.dayStart
    const gap = freeSlots(ctx.blocks, from, ctx.dayEnd).find((s) => s.end - s.start >= minutes)
    if (!gap) return { ok: false, reason: "no-gap", title, minutes }
    return { ok: true, block: { title, kind, start: gap.start, end: gap.start + minutes, placed: "gap", days: repeat.days } }
  }
  const finish = Math.min(24 * 60, end ?? start + minutes)
  return { ok: true, block: { title, kind, start: Math.min(start, finish - 5), end: finish, placed: "typed", days: repeat.days } }
}
