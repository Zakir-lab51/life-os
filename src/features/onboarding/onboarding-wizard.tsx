"use client"

import { ArrowLeft, ArrowRight, Check, Laptop, Moon, Plus, Sparkles, Sun } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useTheme } from "next-themes"
import { useState, type ReactNode } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Icon } from "@/components/os/icon"
import { createHabit, updatePrefs } from "@/lib/db/repo"
import { db } from "@/lib/db/db"
import { seedDemo } from "@/lib/db/demo"
import { FOCUS_STYLES } from "@/lib/db/defaults"
import { ACCENT_CLASSES, RADAR_META } from "@/lib/domain/areas"
import { describeSchedule } from "@/lib/domain/habits"
import { formatClock, hhmmToMinutes, todayISO } from "@/lib/domain/dates"
import { RADAR_DIMS, type Area, type Habit, type ProductivityStyle, type RadarDim } from "@/lib/domain/types"
import type { HabitInput } from "@/lib/validation/schemas"
import { reportError } from "@/lib/feedback"
import { cn } from "@/lib/utils"
import { LifeMark } from "@/features/shell/sidebar"
import { quietly } from "@/features/shell/progress"

const GOALS = ["Ace my exams", "Get fit", "Build a side project", "Save money", "Read more", "Sleep better", "Learn a new skill", "Be more consistent", "Reduce stress", "Grow my career"]

const STARTER_HABITS: (Omit<HabitInput, "startDate"> & { key: string })[] = [
  { key: "water", name: "Drink 2L water", icon: "Droplets", color: "blue", area: "health", schedule: { kind: "daily" }, timeOfDay: "anytime" },
  { key: "move", name: "Move for 30 minutes", icon: "Dumbbell", color: "mint", area: "health", schedule: { kind: "weekly", times: 4 }, timeOfDay: "morning" },
  { key: "read", name: "Read 20 pages", icon: "BookOpen", color: "violet", area: "study", schedule: { kind: "daily" }, timeOfDay: "evening" },
  { key: "meditate", name: "Meditate 10 minutes", icon: "Leaf", color: "cyan", area: "mind", schedule: { kind: "daily" }, timeOfDay: "morning" },
  { key: "sleep", name: "In bed by 11 pm", icon: "Moon", color: "lilac", area: "health", schedule: { kind: "daily" }, timeOfDay: "evening" },
  { key: "spend", name: "Review spending", icon: "Wallet", color: "amber", area: "finance", schedule: { kind: "weekdays", days: [0] }, timeOfDay: "evening" },
  { key: "skill", name: "Practise a skill", icon: "Target", color: "rose", area: "personal", schedule: { kind: "weekly", times: 3 }, timeOfDay: "afternoon" },
]


const DIM_AREAS: Record<RadarDim, Area[]> = {
  productivity: ["work"],
  learning: ["study"],
  health: ["health"],
  finance: ["finance"],
  growth: ["mind", "personal"],
  consistency: [],
}

function ChipToggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn("inline-flex items-center gap-1.5 rounded-control border px-3.5 py-2 text-sm transition-all", on ? "border-violet bg-violet/15 text-foreground" : "border-line text-muted-foreground hover:border-foreground/30 hover:text-foreground")}
    >
      {on && <Check className="size-3.5 text-violet" />}
      {children}
    </button>
  )
}

export function OnboardingWizard() {
  const { theme, setTheme } = useTheme()
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState("")
  const [goals, setGoals] = useState<string[]>([])
  const [customGoal, setCustomGoal] = useState("")
  const [dayStart, setDayStart] = useState("08:00")
  const [dayEnd, setDayEnd] = useState("22:00")
  const [style, setStyle] = useState<ProductivityStyle>("classic")
  const [dims, setDims] = useState<RadarDim[]>([...RADAR_DIMS])
  const [habits, setHabits] = useState<string[]>(["water", "read"])

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  const startMin = hhmmToMinutes(dayStart) ?? 480
  const endMin = hhmmToMinutes(dayEnd) ?? 1320
  const scheduleOk = endMin > startMin + 60

  const finish = async (mode: "fresh" | "demo" | "skip") => {
    setBusy(true)
    try {
      const f = FOCUS_STYLES[style]
      await updatePrefs(
        mode === "skip"
          ? { onboarded: true }
          : {
              onboarded: true,
              name: name.trim().slice(0, 40),
              lifeGoals: goals.slice(0, 12),
              dayStartMin: startMin,
              dayEndMin: scheduleOk ? endMin : startMin + 14 * 60,
              productivityStyle: style,
              focus: { focusMin: f.focusMin, shortBreakMin: f.shortBreakMin, longBreakMin: f.longBreakMin, longEvery: f.longEvery, autoStartBreaks: true, dailyTargetMin: 120 },
              radarDims: dims.length >= 3 ? dims : [...RADAR_DIMS],
              focusAreas: [...new Set(dims.flatMap((d) => DIM_AREAS[d]))],
            },
      )
      if (mode === "demo") await quietly(() => seedDemo())
      if (mode !== "skip") {
        // the demo already includes some of the starter habits; don't create look-alikes
        const existing = new Set((await db.habits.toArray()).map((h) => h.name.toLowerCase()))
        for (const key of habits) {
          const h = STARTER_HABITS.find((x) => x.key === key)
          if (h && !existing.has(h.name.toLowerCase())) {
            await createHabit({ name: h.name, icon: h.icon, color: h.color, area: h.area, schedule: h.schedule, timeOfDay: h.timeOfDay, startDate: todayISO() })
          }
        }
      }
      if (mode === "demo") {
        toast.success("Demo data loaded", { description: "Everything marked demo can be removed in Settings → Data." })
      } else {
        toast.success(`Welcome${name.trim() ? `, ${name.trim()}` : ""}`, { description: "Press Q any time to capture a task." })
      }
    } catch (e) {
      reportError(e)
      setBusy(false)
    }
  }

  const steps: { title: string; body: string; content: ReactNode; canNext?: boolean }[] = [
    {
      title: "Welcome to LIFE OS",
      body: "A personal command centre for your day, habits, focus and progress. Everything stays in this browser: no account needed.",
      content: (
        <div className="space-y-2">
          <label htmlFor="ob-name" className="text-sm text-muted-foreground">
            What should LIFE OS call you?
          </label>
          <Input id="ob-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Your first name" className="h-12 rounded-2xl text-lg" maxLength={40} onKeyDown={(e) => e.key === "Enter" && setStep(1)} />
        </div>
      ),
    },
    {
      title: "What are you working towards?",
      body: "Pick a few. They're saved to your profile, and the Goals page can turn them into yearly goals with milestones.",
      content: (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {[...GOALS, ...goals.filter((g) => !GOALS.includes(g))].map((g) => (
              <ChipToggle key={g} on={goals.includes(g)} onClick={() => setGoals(toggle(goals, g))}>
                {g}
              </ChipToggle>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              const g = customGoal.trim()
              if (g && !goals.includes(g)) setGoals([...goals, g.slice(0, 120)])
              setCustomGoal("")
            }}
          >
            <Input value={customGoal} onChange={(e) => setCustomGoal(e.target.value)} placeholder="Add your own" className="h-10 rounded-xl" maxLength={120} />
            <Button type="submit" variant="secondary" size="icon" aria-label="Add goal" className="size-10">
              <Plus />
            </Button>
          </form>
        </div>
      ),
    },
    {
      title: "What does your day look like?",
      body: "Plan My Day only schedules inside these hours.",
      canNext: scheduleOk,
      content: (
        <div className="grid grid-cols-2 gap-4">
          <label className="space-y-1.5">
            <span className="text-sm text-muted-foreground">Day starts</span>
            <Input type="time" value={dayStart} onChange={(e) => setDayStart(e.target.value)} className="h-12 rounded-2xl text-lg" />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm text-muted-foreground">Day ends</span>
            <Input type="time" value={dayEnd} onChange={(e) => setDayEnd(e.target.value)} className="h-12 rounded-2xl text-lg" />
          </label>
          {!scheduleOk && <p className="col-span-2 text-sm text-destructive">Your day should end at least an hour after it starts.</p>}
          {scheduleOk && (
            <p className="col-span-2 text-sm text-muted-foreground">
              {formatClock(startMin)} to {formatClock(endMin)}: {Math.round((endMin - startMin) / 60)} hours to plan.
            </p>
          )}
        </div>
      ),
    },
    {
      title: "How do you like to focus?",
      body: "Sets your default timer. You can change it any time.",
      content: (
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(FOCUS_STYLES) as ProductivityStyle[]).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={style === k}
              onClick={() => setStyle(k)}
              className={cn("rounded-2xl border p-4 text-left transition-all", style === k ? "border-violet bg-violet/10" : "border-line hover:border-foreground/30")}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{FOCUS_STYLES[k].label}</span>
                {style === k && <Check className="size-4 text-violet" />}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{FOCUS_STYLES[k].description}</p>
            </button>
          ))}
        </div>
      ),
    },
    {
      title: "Which areas of life should we track?",
      body: "These become the axes of your Life Balance radar. Keep at least three.",
      canNext: dims.length >= 3,
      content: (
        <div className="grid gap-2 sm:grid-cols-2">
          {RADAR_DIMS.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={dims.includes(d)}
              onClick={() => setDims(toggle(dims, d))}
              className={cn("flex items-start gap-3 rounded-2xl border p-3 text-left transition-all", dims.includes(d) ? "border-violet bg-violet/10" : "border-line hover:border-foreground/30")}
            >
              <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border", dims.includes(d) ? "border-violet bg-violet text-primary-foreground" : "border-line")}>{dims.includes(d) && <Check className="size-3.5" />}</span>
              <span>
                <span className="font-medium">{RADAR_META[d].label}</span>
                <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{RADAR_META[d].how}</span>
              </span>
            </button>
          ))}
        </div>
      ),
    },
    {
      title: "Start with a few habits?",
      body: "Small and specific works best. You can edit or add more later.",
      content: (
        <div className="grid gap-2 sm:grid-cols-2">
          {STARTER_HABITS.map((h) => {
            const on = habits.includes(h.key)
            return (
              <button
                key={h.key}
                type="button"
                aria-pressed={on}
                onClick={() => setHabits(toggle(habits, h.key))}
                className={cn("flex items-center gap-3 rounded-2xl border p-3 text-left transition-all", on ? "border-violet bg-violet/10" : "border-line hover:border-foreground/30")}
              >
                <span className={cn("grid size-9 place-items-center rounded-xl", ACCENT_CLASSES[h.color!].soft, ACCENT_CLASSES[h.color!].text)}>
                  <Icon name={h.icon!} className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{h.name}</span>
                  <span className="text-xs text-muted-foreground">{describeSchedule({ schedule: h.schedule } as Habit)}</span>
                </span>
                {on && <Check className="size-4 text-violet" />}
              </button>
            )
          })}
        </div>
      ),
    },
    {
      title: "Pick a look",
      body: "Dark is the signature look. Light is fully supported.",
      content: (
        <div className="grid grid-cols-3 gap-2">
          {[
            { v: "dark", label: "Dark", icon: Moon },
            { v: "light", label: "Light", icon: Sun },
            { v: "system", label: "System", icon: Laptop },
          ].map(({ v, label, icon: I }) => (
            <button key={v} type="button" aria-pressed={theme === v} onClick={() => setTheme(v)} className={cn("flex flex-col items-center gap-2 rounded-2xl border p-4 transition-all", theme === v ? "border-violet bg-violet/10" : "border-line hover:border-foreground/30")}>
              <I className="size-5" />
              <span className="text-sm font-medium">{label}</span>
            </button>
          ))}
        </div>
      ),
    },
    {
      title: "Ready when you are",
      body: "Start with a clean slate, or explore LIFE OS filled with clearly labelled sample data you can remove in one click.",
      content: (
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" disabled={busy} onClick={() => void finish("fresh")} className="group rounded-2xl border border-line p-5 text-left transition-all hover:border-violet hover:bg-violet/5 disabled:opacity-60">
            <Sparkles className="size-5 text-violet" />
            <p className="mt-3 font-medium">Start fresh</p>
            <p className="mt-1 text-sm text-muted-foreground">Just your answers and chosen habits.</p>
          </button>
          <button type="button" disabled={busy} onClick={() => void finish("demo")} className="group rounded-2xl border border-line p-5 text-left transition-all hover:border-cyan hover:bg-cyan/5 disabled:opacity-60">
            <Laptop className="size-5 text-cyan" />
            <p className="mt-3 font-medium">Explore with demo data</p>
            <p className="mt-1 text-sm text-muted-foreground">9 weeks of sample tasks, habits and focus. Marked as demo; removable in Settings.</p>
          </button>
        </div>
      ),
    },
  ]

  const current = steps[step]
  const last = step === steps.length - 1

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-background/80 p-4 backdrop-blur-xl" role="dialog" aria-modal="true" aria-labelledby="ob-title">
      <div className="glass w-full max-w-2xl rounded-hero p-6 sm:p-10">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <LifeMark />
            <span className="font-semibold tracking-wide">LIFE OS</span>
          </div>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => void finish("skip")}>
            Skip setup
          </Button>
        </div>
        <div className="mb-6 flex gap-1.5" aria-label={`Step ${step + 1} of ${steps.length}`}>
          {steps.map((_, i) => (
            <span key={i} className={cn("h-1.5 flex-1 rounded-full transition-colors", i <= step ? "bg-violet" : "bg-surface-3")} />
          ))}
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.25 }}>
            <h1 id="ob-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {current.title}
            </h1>
            <p className="mt-2 text-muted-foreground">{current.body}</p>
            <div className="mt-6">{current.content}</div>
          </motion.div>
        </AnimatePresence>
        {!last && (
          <div className="mt-8 flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
              <ArrowLeft /> Back
            </Button>
            <Button onClick={() => setStep((s) => s + 1)} disabled={current.canNext === false}>
              Continue <ArrowRight />
            </Button>
          </div>
        )}
        {last && (
          <div className="mt-8">
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={busy}>
              <ArrowLeft /> Back
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
