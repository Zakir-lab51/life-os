import { beforeEach, describe, expect, it } from "vitest"
import { db } from "@/lib/db/db"
import { exportBackup, restoreBackup } from "@/lib/db/backup"
import { parseBackup } from "@/lib/db/backup-file"
import { createBlockSeries, endSeriesFrom, ensureSeriesBlocks, saveWeeklyReview, skipSeriesDay, unskipSeriesDay, updateSeriesFrom, wipeAllData } from "@/lib/db/repo"
import { describeDays, occurrenceId, seriesDates } from "@/lib/domain/series"

beforeEach(async () => {
  await wipeAllData()
})

// Monday 12 October 2026 onwards
const lecture = { title: "Physiology lecture", kind: "event" as const, start: 600, end: 660, days: [1, 3], from: "2026-10-12", until: null }

describe("series dates", () => {
  it("lists the days a pattern falls on, minus skipped days, within its start and end", () => {
    const s = { days: [1, 3], from: "2026-10-12", until: "2026-10-28", skip: ["2026-10-21"] }
    expect(seriesDates(s, "2026-10-01", "2026-11-30")).toEqual(["2026-10-12", "2026-10-14", "2026-10-19", "2026-10-26", "2026-10-28"])
  })

  it("names the days the way people say them", () => {
    expect(describeDays([1, 2, 3, 4, 5])).toBe("Weekdays")
    expect(describeDays([0, 1, 2, 3, 4, 5, 6])).toBe("Every day")
    expect(describeDays([6, 0])).toBe("Weekends")
    expect(describeDays([5, 1, 3])).toBe("Mon, Wed, Fri")
    expect(describeDays([0, 1], 0)).toBe("Sun, Mon")
  })
})

describe("repeating blocks", () => {
  it("puts the series' days on the timeline, once, with predictable ids", async () => {
    const s = await createBlockSeries(lecture)
    const blocks = await db.blocks.where("seriesId").equals(s.id).sortBy("date")
    expect(blocks[0]).toMatchObject({ id: occurrenceId(s.id, "2026-10-12"), date: "2026-10-12", start: 600, end: 660, title: "Physiology lecture" })
    expect(blocks.every((b) => [1, 3].includes(new Date(b.date + "T12:00").getDay()))).toBe(true)
    // making them again adds nothing
    expect(await ensureSeriesBlocks("2026-10-12", "2026-11-09")).toBe(0)
  })

  it("takes one day out for good, and can put it back", async () => {
    const s = await createBlockSeries(lecture)
    const day = (await db.blocks.get(occurrenceId(s.id, "2026-10-14")))!
    await skipSeriesDay(day)
    expect(await db.blocks.get(day.id)).toBeUndefined()
    await ensureSeriesBlocks("2026-10-12", "2026-10-31")
    expect(await db.blocks.get(day.id)).toBeUndefined()
    await unskipSeriesDay(day)
    expect(await db.blocks.get(day.id)).toBeDefined()
    expect((await db.blockSeries.get(s.id))!.skip).toEqual([])
  })

  it("changes from a day on, keeping earlier days as they were", async () => {
    const s = await createBlockSeries(lecture)
    await updateSeriesFrom(s.id, { start: 540, end: 600 }, "2026-10-19")
    expect((await db.blocks.get(occurrenceId(s.id, "2026-10-14")))!.start).toBe(600)
    expect((await db.blocks.get(occurrenceId(s.id, "2026-10-19")))!.start).toBe(540)
  })

  it("ends from a day on; ending on its first day removes it", async () => {
    const s = await createBlockSeries(lecture)
    await endSeriesFrom(s.id, "2026-10-19")
    expect((await db.blockSeries.get(s.id))!.until).toBe("2026-10-18")
    expect(await db.blocks.where("seriesId").equals(s.id).count()).toBe(2)
    await endSeriesFrom(s.id, "2026-10-12")
    expect(await db.blockSeries.get(s.id)).toBeUndefined()
    expect(await db.blocks.where("seriesId").equals(s.id).count()).toBe(0)
  })

  it("survives a backup and restore", async () => {
    const s = await createBlockSeries(lecture)
    const backup = parseBackup(JSON.stringify(await exportBackup()))
    await wipeAllData()
    await restoreBackup(backup)
    expect((await db.blockSeries.get(s.id))?.days).toEqual([1, 3])
    expect((await db.blocks.get(occurrenceId(s.id, "2026-10-12")))?.seriesId).toBe(s.id)
  })
})

describe("weekly review", () => {
  it("makes next week's top three as tasks the first time, and only then", async () => {
    const r = await saveWeeklyReview({ weekStart: "2026-10-12", wins: "Finished cardio", improve: "Sleep earlier", top: ["Revise renal", "", "Mock viva"] })
    expect(r.topTaskIds).toHaveLength(2)
    const tasks = await db.tasks.bulkGet(r.topTaskIds)
    expect(tasks.map((t) => [t!.title, t!.priority, t!.dueDate, t!.tags])).toEqual([
      ["Revise renal", 1, "2026-10-25", ["top3"]],
      ["Mock viva", 1, "2026-10-25", ["top3"]],
    ])
    const again = await saveWeeklyReview({ weekStart: "2026-10-12", wins: "Finished cardio and renal", improve: "", top: ["Something else"] })
    expect(again.topTaskIds).toEqual(r.topTaskIds)
    expect(await db.tasks.count()).toBe(2)
    expect(again.createdAt).toBe(r.createdAt)
  })
})
