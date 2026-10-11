import { z } from "zod"
import { FONTS, MATERIALS, PHOTOS, type FontId, type MaterialId, type PhotoId } from "@/lib/design/design"
import { AREAS, GOAL_HORIZONS, QUICK_ACTIONS, RADAR_DIMS, WIDGET_IDS } from "@/lib/domain/types"

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date")
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm")
const isoDateTime = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Use a valid date and time")
const id = z.string().min(1).max(64)
const area = z.enum(AREAS)
const accent = z.enum(["violet", "cyan", "blue", "mint", "amber", "rose", "lilac"])

export const recurrenceSchema = z
  .object({
    freq: z.enum(["daily", "weekly", "monthly"]),
    interval: z.number().int().min(1, "At least 1").max(365),
    weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  })
  .nullable()

export const subtaskSchema = z.object({
  id,
  title: z.string().trim().min(1, "Subtask needs a title").max(200),
  done: z.boolean(),
})

export const taskInputSchema = z.object({
  title: z.string().trim().min(1, "Give the task a title").max(200, "Keep the title under 200 characters"),
  notes: z.string().max(5000).default(""),
  status: z.enum(["todo", "in_progress", "done"]).default("todo"),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).default(3),
  area: area.default("work"),
  tags: z.array(z.string().trim().min(1).max(32)).max(12, "Up to 12 tags").default([]),
  dueDate: isoDate.nullable().default(null),
  dueTime: hhmm.nullable().default(null),
  reminderAt: isoDateTime.nullable().default(null),
  estimateMin: z.number().int().min(5, "At least 5 minutes").max(720, "At most 12 hours").default(30),
  subtasks: z.array(subtaskSchema).max(50).default([]),
  recurrence: recurrenceSchema.default(null),
  dependsOn: z.array(id).max(20).default([]),
  goalId: id.nullable().default(null),
})
export type TaskInput = z.input<typeof taskInputSchema>

export const habitScheduleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("daily") }),
  z.object({ kind: z.literal("weekdays"), days: z.array(z.number().int().min(0).max(6)).min(1, "Pick at least one day").max(7) }),
  z.object({ kind: z.literal("weekly"), times: z.number().int().min(1, "At least once").max(7, "At most 7 times") }),
])

export const habitInputSchema = z.object({
  name: z.string().trim().min(1, "Name your habit").max(60, "Keep it under 60 characters"),
  icon: z.string().min(1).max(40).default("Sparkles"),
  color: accent.default("violet"),
  area: area.default("health"),
  schedule: habitScheduleSchema.default({ kind: "daily" }),
  timeOfDay: z.enum(["morning", "afternoon", "evening", "anytime"]).default("anytime"),
  startDate: isoDate,
})
export type HabitInput = z.input<typeof habitInputSchema>

export const blockInputSchema = z
  .object({
    date: isoDate,
    start: z.number().int().min(0).max(24 * 60 - 5),
    end: z.number().int().min(5).max(24 * 60),
    title: z.string().trim().min(1, "Give the block a title").max(120),
    kind: z.enum(["task", "focus", "break", "event", "routine", "habit"]).default("event"),
    taskId: id.nullable().default(null),
    notes: z.string().max(2000).default(""),
    source: z.enum(["manual", "plan"]).default("manual"),
  })
  .refine((b) => b.end > b.start, { message: "End must be after start", path: ["end"] })
  .refine((b) => b.end - b.start >= 5, { message: "Blocks are at least 5 minutes", path: ["end"] })
export type BlockInput = z.input<typeof blockInputSchema>

export const reflectionInputSchema = z.object({
  mood: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  wins: z.string().max(2000).default(""),
  improve: z.string().max(2000).default(""),
})

/* ── goals ── */

export const milestoneSchema = z.object({
  id,
  title: z.string().trim().min(1, "Give the milestone a name").max(120, "Keep it under 120 characters"),
  due: isoDate.nullable(),
  doneAt: isoDateTime.nullable(),
})

export const goalMeasureSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("milestones") }),
  z.object({ kind: z.literal("tasks") }),
  z.object({ kind: z.literal("target"), unit: z.string().trim().max(20), start: z.number().finite(), target: z.number().finite() }),
  z.object({ kind: z.literal("habit"), habitId: id, target: z.number().int().min(1, "At least 1 check-in").max(10000) }),
])

export const goalInputSchema = z
  .object({
    title: z.string().trim().min(1, "Name your goal").max(160, "Keep the name under 160 characters"),
    why: z.string().max(2000).default(""),
    horizon: z.enum(GOAL_HORIZONS).default("month"),
    area: area.default("personal"),
    startDate: isoDate,
    dueDate: isoDate.nullable().default(null),
    measure: goalMeasureSchema.default({ kind: "milestones" }),
    milestones: z.array(milestoneSchema).max(50, "Up to 50 milestones").default([]),
    habitIds: z.array(id).max(20).default([]),
    parentId: id.nullable().default(null),
  })
  .superRefine((g, ctx) => {
    if (g.dueDate && g.dueDate < g.startDate) ctx.addIssue({ code: "custom", message: "The deadline is before the start", path: ["dueDate"] })
    if (g.measure.kind === "target" && g.measure.target === g.measure.start) ctx.addIssue({ code: "custom", message: "The target must differ from where you start", path: ["measure", "target"] })
  })
export type GoalInput = z.input<typeof goalInputSchema>

export const goalLogInputSchema = z.object({
  date: isoDate,
  value: z.number({ message: "Enter a number" }).finite("Enter a number"),
  note: z.string().max(500).default(""),
})

export const designSchema = z.object({
  preset: z.string().max(40),
  hue: z.number().min(0).max(360),
  saturation: z.number().min(0).max(1.4),
  radius: z.number().min(0).max(1.6),
  glass: z.number().min(0).max(1),
  glassBlur: z.number().min(0).max(40),
  glow: z.number().min(0).max(1.6),
  scale: z.number().min(0.9).max(1.1),
  font: z.enum(Object.keys(FONTS) as [FontId, ...FontId[]]),
  material: z.enum(Object.keys(MATERIALS) as [MaterialId, ...MaterialId[]]),
  photo: z.enum(Object.keys(PHOTOS) as [PhotoId, ...PhotoId[]]),
  photoDim: z.number().min(0).max(0.9),
  photoBlur: z.number().min(0).max(30),
})

const routineItem = z.object({ id, label: z.string().trim().min(1).max(80) })

export const prefsSchema = z
  .object({
    id: z.literal("prefs"),
    name: z.string().trim().max(40),
    onboarded: z.boolean(),
    dayStartMin: z.number().int().min(0).max(23 * 60),
    dayEndMin: z.number().int().min(60).max(24 * 60),
    weekStartsOn: z.union([z.literal(0), z.literal(1)]),
    focus: z.object({
      focusMin: z.number().int().min(5).max(180),
      shortBreakMin: z.number().int().min(1).max(60),
      longBreakMin: z.number().int().min(1).max(90),
      longEvery: z.number().int().min(2).max(10),
      autoStartBreaks: z.boolean(),
      dailyTargetMin: z.number().int().min(0).max(16 * 60),
    }),
    routines: z.object({ morning: z.array(routineItem).max(20), evening: z.array(routineItem).max(20) }),
    widgets: z.array(z.object({ id: z.enum(WIDGET_IDS), visible: z.boolean() })),
    radarDims: z.array(z.enum(RADAR_DIMS)).min(3, "Keep at least 3 dimensions"),
    quickActions: z.array(z.enum(QUICK_ACTIONS)),
    seenQuickActions: z.array(z.enum(QUICK_ACTIONS)).optional(),
    notifications: z.object({ browser: z.boolean(), reminders: z.boolean(), focus: z.boolean(), achievements: z.boolean() }),
    weeklyTargets: z.object({
      tasks: z.number().int().min(1).max(500),
      focusMin: z.number().int().min(0).max(100 * 60),
      habitRate: z.number().min(0).max(1),
    }),
    lifeGoals: z.array(z.string().max(120)).max(12),
    productivityStyle: z.enum(["classic", "deep", "flow", "flexible"]),
    focusAreas: z.array(area),
    studyInterests: z.array(z.string().max(60)).max(20),
    currency: z.string().length(3),
    motion: z.enum(["system", "reduced"]),
    design: designSchema,
    lastSeenLevel: z.number().int().min(0),
    designVersion: z.number().int().min(1).optional(),
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
  })
  .refine((p) => p.dayEndMin > p.dayStartMin + 60, { message: "Your day must end at least an hour after it starts", path: ["dayEndMin"] })

/* ── Full records, used to validate backups before restoring them ── */

const stamps = { createdAt: isoDateTime, updatedAt: isoDateTime, demo: z.boolean().optional() }

export const taskRecordSchema = z.object({
  id,
  title: z.string().max(200),
  notes: z.string().max(5000),
  status: z.enum(["todo", "in_progress", "done"]),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  area,
  tags: z.array(z.string().max(32)),
  dueDate: isoDate.nullable(),
  dueTime: hhmm.nullable(),
  reminderAt: isoDateTime.nullable(),
  reminderFired: z.boolean(),
  estimateMin: z.number().int().min(1).max(24 * 60),
  subtasks: z.array(subtaskSchema),
  recurrence: recurrenceSchema,
  seriesId: id.nullable(),
  nextId: id.nullable().optional(),
  dependsOn: z.array(id),
  goalId: id.nullable().optional(),
  order: z.number(),
  completedAt: isoDateTime.nullable(),
  ...stamps,
})

const goalRecordSchema = z.object({
  id,
  title: z.string().max(160),
  why: z.string().max(2000),
  horizon: z.enum(GOAL_HORIZONS),
  area,
  startDate: isoDate,
  dueDate: isoDate.nullable(),
  measure: goalMeasureSchema,
  milestones: z.array(milestoneSchema),
  habitIds: z.array(id),
  parentId: id.nullable(),
  status: z.enum(["active", "done", "archived"]),
  completedAt: isoDateTime.nullable(),
  order: z.number(),
  ...stamps,
})

const goalLogRecordSchema = z.object({ id: z.string(), goalId: id, date: isoDate, value: z.number(), note: z.string().max(500), createdAt: isoDateTime, demo: z.boolean().optional() })

export const habitRecordSchema = z.object({
  id,
  name: z.string().max(60),
  icon: z.string().max(40),
  color: accent,
  area,
  schedule: habitScheduleSchema,
  timeOfDay: z.enum(["morning", "afternoon", "evening", "anytime"]),
  startDate: isoDate,
  order: z.number(),
  archivedAt: isoDateTime.nullable(),
  ...stamps,
})

export const backupSchema = z.object({
  app: z.literal("life-os"),
  version: z.number().int().min(1),
  exportedAt: isoDateTime,
  data: z.object({
    prefs: z.array(prefsSchema).max(1),
    tasks: z.array(taskRecordSchema),
    habits: z.array(habitRecordSchema),
    habitLogs: z.array(z.object({ id: z.string(), habitId: id, date: isoDate, createdAt: isoDateTime, demo: z.boolean().optional() })),
    blocks: z.array(
      z.object({
        id,
        date: isoDate,
        start: z.number().int().min(0).max(24 * 60),
        end: z.number().int().min(0).max(24 * 60),
        title: z.string().max(120),
        kind: z.enum(["task", "focus", "break", "event", "routine", "habit"]),
        taskId: id.nullable(),
        notes: z.string().max(2000),
        source: z.enum(["manual", "plan"]),
        ...stamps,
      }),
    ),
    focusSessions: z.array(
      z.object({
        id,
        mode: z.enum(["pomodoro", "custom", "stopwatch"]),
        date: isoDate,
        startedAt: isoDateTime,
        endedAt: isoDateTime,
        plannedSec: z.number().nullable(),
        actualSec: z.number().min(0),
        taskId: id.nullable(),
        area: area.nullable(),
        completed: z.boolean(),
        demo: z.boolean().optional(),
      }),
    ),
    reflections: z.array(
      z.object({
        id: isoDate,
        date: isoDate,
        mood: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
        wins: z.string().max(2000),
        improve: z.string().max(2000),
        ...stamps,
      }),
    ),
    routineChecks: z.array(z.object({ id: z.string(), date: isoDate, itemId: id, createdAt: isoDateTime, demo: z.boolean().optional() })),
    activity: z.array(
      z.object({
        id,
        type: z.string(),
        at: isoDateTime,
        title: z.string(),
        refId: id.nullable(),
        area: area.nullable(),
        dedupeKey: z.string(),
        demo: z.boolean().optional(),
      }),
    ),
    achievements: z.array(z.object({ id: z.string(), unlockedAt: isoDateTime })),
    // added in Phase 2; older backups don't have them
    goals: z.array(goalRecordSchema).default([]),
    goalLogs: z.array(goalLogRecordSchema).default([]),
  }),
})
export type Backup = z.infer<typeof backupSchema>

/** First message per field, for showing inline form errors. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_"
    if (!out[key]) out[key] = issue.message
  }
  return out
}
