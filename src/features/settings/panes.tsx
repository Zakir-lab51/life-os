"use client"

import { AlarmClock, ArrowDown, ArrowUp, Check, Keyboard, Plus, Timer, Trash2, Trophy } from "lucide-react"
import { useTheme } from "next-themes"
import { useState } from "react"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Segmented } from "@/components/os/field"
import { HatchBar } from "@/components/os/visuals"
import { ProfileAvatar } from "@/components/os/profile-avatar"
import { FOCUS_STYLES } from "@/lib/db/defaults"
import { updatePrefs, ValidationError } from "@/lib/db/repo"
import { RADAR_META } from "@/lib/domain/areas"
import { hhmmToMinutes, minutesToHHMM } from "@/lib/domain/dates"
import { QUICK_ACTIONS, RADAR_DIMS, type Prefs, type ProductivityStyle, type RoutineItem } from "@/lib/domain/types"
import { reportError } from "@/lib/feedback"
import { useUI } from "@/lib/stores/ui"
import { cn, uid } from "@/lib/utils"
import { QUICK_ACTION_META } from "@/features/shell/actions"
import { LifeMark } from "@/features/shell/sidebar"
import { centreOf, switchTheme } from "@/features/shell/theme-switch"
import { useLife, useXP } from "@/features/shell/use-life"
import { WIDGET_META } from "@/features/overview/overview-view"
import { DesignStudio } from "./design-studio"
import { ChipEditor, ChoiceRow, Group, IconTile, Row, Stepper } from "./settings-ui"

/** Settings save silently, like Apple's: the control itself shows the change. Errors still surface. */
export async function save(patch: Partial<Prefs>) {
  try {
    await updatePrefs(patch)
    return true
  } catch (e) {
    reportError(e)
    return false
  }
}

const minutes = (m: number) => {
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest ? `${h} h ${rest} min` : `${h} h`
}

/* ── Profile ─────────────────────────────────────────────── */

export function ProfilePane({ prefs }: { prefs: Prefs }) {
  const life = useLife()
  const xp = useXP(life?.data)
  const [name, setName] = useState(prefs.name)
  const commitName = () => {
    const v = name.trim().slice(0, 40)
    if (v !== prefs.name) void save({ name: v })
  }
  return (
    <>
      <div className="flex items-center gap-4 rounded-[calc(var(--radius)*1.15)] bg-surface-2/60 p-4 ring-1 ring-line">
        <ProfileAvatar name={prefs.name} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold tracking-tight">{prefs.name || "Your profile"}</p>
          {xp && (
            <>
              <p className="text-sm text-muted-foreground">
                Level {xp.level.level} · <span className="text-violet">{xp.level.title}</span>
              </p>
              <div className="mt-2 flex items-center gap-2">
                <HatchBar value={xp.level.intoLevel / xp.level.needed} height={6} className="max-w-56" />
                <span className="text-[11px] text-muted-foreground tabular">
                  {xp.level.intoLevel}/{xp.level.needed} XP
                </span>
              </div>
            </>
          )}
        </div>
      </div>
      <Group>
        <Row
          id="s-name"
          label="Name"
          htmlFor="set-name"
          control={
            <Input
              id="set-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              placeholder="Add your name"
              maxLength={40}
              className="h-8 w-44 rounded-full border-0 bg-transparent text-right shadow-none focus-visible:bg-surface-3/70 focus-visible:ring-1 dark:bg-transparent"
            />
          }
        />
      </Group>
      <Group id="s-goals" title="Life goals" footer="Saved to your profile. They'll seed the Goals module when it arrives in Phase 2.">
        <ChipEditor values={prefs.lifeGoals} onChange={(v) => void save({ lifeGoals: v })} placeholder="Add a goal" max={12} label="Add a life goal" />
      </Group>
    </>
  )
}

/* ── Appearance ──────────────────────────────────────────── */

function ThemePreview({ kind }: { kind: "light" | "dark" | "system" }) {
  const scene = (dark: boolean) => (
    <span className={cn("absolute inset-0 p-1.5", dark ? "bg-[#17171d]" : "bg-[#e9ebf2]")}>
      <span className={cn("flex h-full gap-1 rounded-[6px] p-1", dark ? "bg-[#26262f]" : "bg-white")}>
        <span className={cn("w-1/4 rounded-[4px]", dark ? "bg-[#33333e]" : "bg-[#eceef4]")} />
        <span className="flex flex-1 flex-col gap-1 p-0.5">
          <span className="h-1.5 w-3/4 rounded-full bg-violet/80" />
          <span className={cn("h-1.5 w-1/2 rounded-full", dark ? "bg-white/25" : "bg-black/12")} />
          <span className={cn("mt-auto h-3 rounded-[3px]", dark ? "bg-white/10" : "bg-black/[0.06]")} />
        </span>
      </span>
    </span>
  )
  return (
    <span className="relative block aspect-[4/3] w-full overflow-hidden rounded-[10px]">
      {kind === "system" ? (
        <>
          {scene(false)}
          <span className="absolute inset-0 [clip-path:polygon(100%_0,100%_100%,0_100%)]">{scene(true)}</span>
        </>
      ) : (
        scene(kind === "dark")
      )}
    </span>
  )
}

export function AppearancePane({ prefs }: { prefs: Prefs }) {
  const { theme, setTheme } = useTheme()
  const themes = [
    { v: "light", label: "Light" },
    { v: "dark", label: "Dark" },
    { v: "system", label: "Auto" },
  ] as const
  return (
    <>
      <Group id="s-theme" title="Theme" footer="Auto follows your device's light or dark setting.">
        <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-3 p-4">
          {themes.map((t) => {
            const active = theme === t.v
            return (
              <button key={t.v} type="button" role="radio" aria-checked={active} onClick={(e) => switchTheme(t.v, setTheme, centreOf(e.currentTarget))} className="group pressable flex flex-col items-center gap-2 [--press-scale:0.97]">
                <span className={cn("block w-full rounded-[13px] p-[3px] ring-1 transition-[box-shadow] duration-300", active ? "ring-2 ring-violet" : "ring-line group-hover:ring-foreground/25")}>
                  <ThemePreview kind={t.v} />
                </span>
                <span className={cn("flex items-center gap-1 text-xs font-medium", active ? "text-foreground" : "text-muted-foreground")}>
                  {active && <Check className="size-3 text-violet" strokeWidth={3} />}
                  {t.label}
                </span>
              </button>
            )
          })}
        </div>
      </Group>
      <Group footer="Turns off animations even if your device allows them. When off, LIFE OS follows your device setting.">
        <Row id="s-motion" label="Reduce motion" control={<Switch checked={prefs.motion === "reduced"} onCheckedChange={(v) => void save({ motion: v ? "reduced" : "system" })} aria-label="Reduce motion" />} />
      </Group>
      <Group id="s-look" title="Look">
        <div className="@container p-4">
          <DesignStudio saved={prefs.design} />
        </div>
      </Group>
    </>
  )
}

/* ── Notifications ───────────────────────────────────────── */

export function NotificationsPane({ prefs }: { prefs: Prefs }) {
  const n = prefs.notifications
  const supported = typeof Notification !== "undefined"
  const [permission, setPermission] = useState(supported ? Notification.permission : "denied")
  const setN = (patch: Partial<Prefs["notifications"]>) => void save({ notifications: { ...n, ...patch } })

  const enableBrowser = async (on: boolean) => {
    if (!on) return setN({ browser: false })
    if (!supported) return toast.error("This browser doesn't support notifications")
    const result = permission === "granted" ? "granted" : await Notification.requestPermission()
    setPermission(result)
    if (result === "granted") setN({ browser: true })
    else toast.error("Notifications are blocked for this site", { description: "Allow them in your browser's site settings, then try again." })
  }

  const status = !supported ? "Not supported" : permission === "granted" ? "Allowed" : permission === "denied" ? "Blocked" : "Not asked yet"
  return (
    <>
      <Group title="Alerts">
        <Row id="s-reminders" icon={<IconTile icon={AlarmClock} color="#ff3b30" />} label="Task reminders" description="When a task's reminder time arrives" control={<Switch checked={n.reminders} onCheckedChange={(v) => setN({ reminders: v })} aria-label="Task reminders" />} />
        <Row id="s-focus-alerts" icon={<IconTile icon={Timer} color="#5e5ce6" />} label="Focus sessions" description="When a focus session or break ends" control={<Switch checked={n.focus} onCheckedChange={(v) => setN({ focus: v })} aria-label="Focus session alerts" />} />
        <Row id="s-achievements" icon={<IconTile icon={Trophy} color="#ff9f0a" />} label="Achievements & levels" description="Celebrate milestones, once each" control={<Switch checked={n.achievements} onCheckedChange={(v) => setN({ achievements: v })} aria-label="Achievement alerts" />} />
      </Group>
      <Group title="Outside the tab" footer="Reminders fire while LIFE OS is open in a tab; local mode has no background push.">
        <Row
          id="s-system-notifications"
          label="System notifications"
          description="Also show alerts in your device's notification centre"
          control={
            <>
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", permission === "granted" ? "bg-mint/20 text-foreground" : permission === "denied" || !supported ? "bg-rose/15 text-foreground" : "bg-surface-3 text-muted-foreground")}>{status}</span>
              <Switch checked={n.browser && permission === "granted"} onCheckedChange={(v) => void enableBrowser(v)} aria-label="System notifications" />
            </>
          }
        />
      </Group>
    </>
  )
}

/* ── Focus ───────────────────────────────────────────────── */

export function FocusPane({ prefs }: { prefs: Prefs }) {
  const f = prefs.focus
  const set = (patch: Partial<Prefs["focus"]>) => void save({ focus: { ...f, ...patch } })
  return (
    <>
      <Group id="s-focus-preset" title="Preset" footer="A preset sets the lengths below; you can still fine-tune them.">
        <div role="radiogroup" aria-label="Focus preset">
          {(Object.keys(FOCUS_STYLES) as ProductivityStyle[]).map((k) => {
            const s = FOCUS_STYLES[k]
            return (
              <ChoiceRow
                key={k}
                label={s.label}
                description={s.description}
                selected={prefs.productivityStyle === k}
                onSelect={() => void save({ productivityStyle: k, focus: { ...f, focusMin: s.focusMin, shortBreakMin: s.shortBreakMin, longBreakMin: s.longBreakMin, longEvery: s.longEvery } })}
              />
            )
          })}
        </div>
      </Group>
      <Group id="s-durations" title="Lengths">
        <Row label="Focus" control={<Stepper label="Focus length" value={f.focusMin} min={5} max={180} step={5} format={minutes} onChange={(v) => set({ focusMin: v })} />} />
        <Row label="Short break" control={<Stepper label="Short break" value={f.shortBreakMin} min={1} max={60} format={minutes} onChange={(v) => set({ shortBreakMin: v })} />} />
        <Row label="Long break" control={<Stepper label="Long break" value={f.longBreakMin} min={5} max={90} step={5} format={minutes} onChange={(v) => set({ longBreakMin: v })} />} />
        <Row label="Long break every" control={<Stepper label="Sessions before a long break" value={f.longEvery} min={2} max={10} format={(v) => `${v} sessions`} onChange={(v) => set({ longEvery: v })} />} />
      </Group>
      <Group id="s-daily-target" footer="Used by today's score and the Focus card.">
        <Row label="Daily focus target" control={<Stepper label="Daily focus target" value={f.dailyTargetMin} min={0} max={960} step={15} format={(v) => (v ? minutes(v) : "Off")} onChange={(v) => set({ dailyTargetMin: v })} />} />
      </Group>
      <Group footer="The next focus session always waits for you.">
        <Row id="s-autostart" label="Start breaks automatically" control={<Switch checked={f.autoStartBreaks} onCheckedChange={(v) => set({ autoStartBreaks: v })} aria-label="Start breaks automatically" />} />
      </Group>
    </>
  )
}

/* ── Day & week ──────────────────────────────────────────── */

function TimeInput({ id, value, onChange, label }: { id: string; value: string; onChange: (v: string) => void; label: string }) {
  return <input id={id} type="time" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className="h-8 rounded-full bg-surface-3/70 px-3 text-sm tabular ring-1 ring-line outline-none focus-visible:ring-2 focus-visible:ring-ring" />
}

export function SchedulePane({ prefs }: { prefs: Prefs }) {
  const [start, setStart] = useState(minutesToHHMM(prefs.dayStartMin))
  const [end, setEnd] = useState(minutesToHHMM(prefs.dayEndMin))
  const [error, setError] = useState<string>()
  const commit = async (s: string, e: string) => {
    const a = hhmmToMinutes(s)
    const b = hhmmToMinutes(e)
    if (a === null || b === null) return
    try {
      await updatePrefs({ dayStartMin: a, dayEndMin: b })
      setError(undefined)
    } catch (err) {
      if (err instanceof ValidationError) setError(Object.values(err.fields)[0])
      else reportError(err)
    }
  }
  return (
    <>
      <Group id="s-day-hours" title="Your day" footer={error ? <span className="text-destructive">{error}</span> : "Plan My Day and free-time calculations only use these hours."}>
        <Row label="Day starts" htmlFor="set-start" control={<TimeInput id="set-start" label="Day starts" value={start} onChange={(v) => { setStart(v); void commit(v, end) }} />} />
        <Row label="Day ends" htmlFor="set-end" control={<TimeInput id="set-end" label="Day ends" value={end} onChange={(v) => { setEnd(v); void commit(start, v) }} />} />
      </Group>
      <Group id="s-week-start" title="Calendar">
        <Row
          label="Week starts on"
          control={
            <Segmented<0 | 1>
              ariaLabel="Week starts on"
              value={prefs.weekStartsOn}
              onChange={(v) => void save({ weekStartsOn: v })}
              options={[
                { value: 1, label: "Monday" },
                { value: 0, label: "Sunday" },
              ]}
            />
          }
        />
      </Group>
    </>
  )
}

/* ── Weekly targets ──────────────────────────────────────── */

export function TargetsPane({ prefs }: { prefs: Prefs }) {
  const t = prefs.weeklyTargets
  const set = (patch: Partial<Prefs["weeklyTargets"]>) => void save({ weeklyTargets: { ...t, ...patch } })
  return (
    <Group id="s-targets" title="Each week" footer="Shown on the dashboard's This week card.">
      <Row label="Tasks finished" control={<Stepper label="Weekly task target" value={t.tasks} min={1} max={500} format={(v) => `${v} tasks`} onChange={(v) => set({ tasks: v })} />} />
      <Row label="Focus time" control={<Stepper label="Weekly focus target" value={t.focusMin} min={0} max={6000} step={30} format={(v) => (v ? minutes(v) : "Off")} onChange={(v) => set({ focusMin: v })} />} />
      <Row label="Habit consistency" control={<Stepper label="Habit consistency target" value={Math.round(t.habitRate * 100)} min={0} max={100} step={5} format={(v) => `${v}%`} onChange={(v) => set({ habitRate: v / 100 })} />} />
    </Group>
  )
}

/* ── Routines ────────────────────────────────────────────── */

function RoutineList({ id, title, items, onChange }: { id: string; title: string; items: RoutineItem[]; onChange: (items: RoutineItem[]) => void }) {
  const [draft, setDraft] = useState("")
  const move = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= items.length) return
    const next = [...items]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  const add = () => {
    const label = draft.trim().slice(0, 80)
    if (!label || items.length >= 20) return
    onChange([...items, { id: uid("r_"), label }])
    setDraft("")
  }
  const iconBtn = "pressable grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.07] hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
  return (
    <Group id={id} title={title}>
      {items.map((item, i) => (
        <div key={item.id} className="group/step relative flex min-h-12 items-center gap-1 px-2 py-1.5 before:absolute before:top-0 before:right-0 before:left-4 before:h-px before:bg-line first:before:hidden">
          <span className="w-6 text-center text-xs text-muted-foreground tabular">{i + 1}</span>
          <Input
            defaultValue={item.label}
            onBlur={(e) => {
              const label = e.target.value.trim()
              if (label && label !== item.label) onChange(items.map((x) => (x.id === item.id ? { ...x, label: label.slice(0, 80) } : x)))
            }}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            aria-label={`${title} step ${i + 1}`}
            maxLength={80}
            className="h-8 flex-1 rounded-full border-0 bg-transparent px-2 shadow-none focus-visible:bg-surface-3/70 focus-visible:ring-1 dark:bg-transparent"
          />
          <span className="flex items-center opacity-60 transition-opacity group-focus-within/step:opacity-100 group-hover/step:opacity-100">
            <button type="button" aria-label={`Move ${item.label} up`} disabled={i === 0} onClick={() => move(i, -1)} className={iconBtn}>
              <ArrowUp className="size-3.5" />
            </button>
            <button type="button" aria-label={`Move ${item.label} down`} disabled={i === items.length - 1} onClick={() => move(i, 1)} className={iconBtn}>
              <ArrowDown className="size-3.5" />
            </button>
            <button type="button" aria-label={`Remove ${item.label}`} onClick={() => onChange(items.filter((x) => x.id !== item.id))} className={cn(iconBtn, "hover:text-destructive")}>
              <Trash2 className="size-3.5" />
            </button>
          </span>
        </div>
      ))}
      <div className="relative flex min-h-12 items-center gap-1 px-2 py-1.5 before:absolute before:top-0 before:right-0 before:left-4 before:h-px before:bg-line first:before:hidden">
        <span className="grid w-6 place-items-center text-violet">
          <Plus className="size-4" />
        </span>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return
            e.preventDefault()
            add()
          }}
          onBlur={add}
          placeholder={items.length >= 20 ? "That's the limit of 20 steps" : "Add a step"}
          disabled={items.length >= 20}
          aria-label={`Add a ${title.toLowerCase()} step`}
          maxLength={80}
          className="h-8 flex-1 rounded-full border-0 bg-transparent px-2 shadow-none focus-visible:bg-surface-3/70 focus-visible:ring-1 dark:bg-transparent"
        />
      </div>
    </Group>
  )
}

export function RoutinesPane({ prefs }: { prefs: Prefs }) {
  return (
    <>
      <RoutineList id="s-morning" title="Morning" items={prefs.routines.morning} onChange={(v) => void save({ routines: { ...prefs.routines, morning: v } })} />
      <RoutineList id="s-evening" title="Evening" items={prefs.routines.evening} onChange={(v) => void save({ routines: { ...prefs.routines, evening: v } })} />
    </>
  )
}

/* ── Dashboard ───────────────────────────────────────────── */

export function DashboardPane({ prefs }: { prefs: Prefs }) {
  return (
    <>
      <Group id="s-widgets" title="Widgets" footer="You can also rearrange them with Customize on the Overview.">
        {prefs.widgets.map((w) => (
          <Row
            key={w.id}
            label={WIDGET_META[w.id].label}
            description={WIDGET_META[w.id].description}
            control={<Switch checked={w.visible} onCheckedChange={(v) => void save({ widgets: prefs.widgets.map((x) => (x.id === w.id ? { ...x, visible: v } : x)) })} aria-label={WIDGET_META[w.id].label} />}
          />
        ))}
      </Group>
      <Group id="s-balance" title="Life Balance areas" footer="The radar needs at least three areas.">
        {RADAR_DIMS.map((d) => (
          <Row
            key={d}
            label={RADAR_META[d].label}
            description={RADAR_META[d].how}
            control={
              <Switch
                checked={prefs.radarDims.includes(d)}
                aria-label={RADAR_META[d].label}
                onCheckedChange={(v) => {
                  const next = v ? [...prefs.radarDims, d] : prefs.radarDims.filter((x) => x !== d)
                  if (next.length < 3) return void toast.error("Keep at least three areas on the radar")
                  void save({ radarDims: RADAR_DIMS.filter((x) => next.includes(x)) })
                }}
              />
            }
          />
        ))}
      </Group>
    </>
  )
}

/* ── Quick add ───────────────────────────────────────────── */

const ACTION_COLORS = ["#0a84ff", "#ff9f0a", "#30b0c7", "#5e5ce6", "#ff375f", "#34c759", "#af52de", "#64d2ff"]

export function QuickAddPane({ prefs }: { prefs: Prefs }) {
  return (
    <Group id="s-quick-add" title="In the + menu" footer="Everything stays available in the command palette (Ctrl K).">
      {QUICK_ACTIONS.map((id, i) => {
        const meta = QUICK_ACTION_META[id]
        return (
          <Row
            key={id}
            icon={<IconTile icon={meta.icon} color={ACTION_COLORS[i % ACTION_COLORS.length]} />}
            label={meta.label}
            description={meta.description}
            control={<Switch checked={prefs.quickActions.includes(id)} aria-label={meta.label} onCheckedChange={(v) => void save({ quickActions: QUICK_ACTIONS.filter((x) => (x === id ? v : prefs.quickActions.includes(x))) })} />}
          />
        )
      })}
    </Group>
  )
}

/* ── About ───────────────────────────────────────────────── */

const PHASES = [
  { n: 1, label: "Foundation", items: "Dashboard, tasks, habits, My Day, focus, calendar, analytics, settings", done: true },
  { n: 2, label: "Personal growth", items: "Goals, life roadmap, projects, weekly reviews", done: false },
  { n: 3, label: "Knowledge", items: "Second brain: notes, backlinks, daily journal", done: false },
  { n: 4, label: "Finance & sync", items: "Finance tracker, accounts and cloud sync", done: false },
  { n: 5, label: "Polish", items: "Performance and deployment", done: false },
]

export function AboutPane() {
  const setShortcuts = useUI((s) => s.setShortcuts)
  return (
    <>
      <div className="flex flex-col items-center gap-2 py-4 text-center">
        <LifeMark className="size-16 [&>span:first-child]:inset-[12px] [&>span:last-child]:size-3.5" />
        <p className="mt-1 text-xl font-semibold tracking-tight">LIFE OS</p>
        <p className="text-sm text-muted-foreground">Version 0.1 · Local mode</p>
      </div>
      <Group id="s-roadmap" title="Roadmap">
        {PHASES.map((p) => (
          <Row
            key={p.n}
            icon={<span className={cn("grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold", p.done ? "bg-mint text-white" : "bg-surface-3 text-muted-foreground")}>{p.done ? <Check className="size-3.5" strokeWidth={3} /> : p.n}</span>}
            label={`Phase ${p.n}: ${p.label}`}
            description={p.items}
            control={<span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", p.done ? "bg-mint/20 text-foreground" : "bg-surface-3 text-muted-foreground")}>{p.done ? "Available" : "Planned"}</span>}
          />
        ))}
      </Group>
      <Group footer="LIFE OS keeps everything in this browser. Nothing is sent anywhere unless you export it.">
        <Row id="s-shortcuts" icon={<IconTile icon={Keyboard} color="#636366" />} label="Keyboard shortcuts" onClick={() => setShortcuts(true)} />
      </Group>
    </>
  )
}
