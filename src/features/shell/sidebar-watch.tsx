"use client"

import { useRouter } from "next/navigation"
import { useEffect, useId, useRef, useState, type CSSProperties } from "react"
import { toast } from "sonner"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useNow, usePrefs } from "@/lib/db/hooks"
import { formatClock, formatDuration, minutesOfDay } from "@/lib/domain/dates"
import { elapsedMs } from "@/lib/domain/focus"
import { moonPath, moonPhase, moonPhaseName } from "@/lib/domain/moon"
import { dayProgress } from "@/lib/domain/planner"
import { useFocus } from "@/lib/stores/focus"

/*
  A vintage chronograph at the foot of the sidebar, in whatever room the tabs leave
  (none when there's too little). Every complication does a job:
  - the hands tell the time; small seconds tick at 9 o'clock, eight beats a second like
    a mechanical movement;
  - the chronograph times focus: the red centre seconds hand sweeps while a session
    runs and the register at 3 o'clock counts its minutes. The top pusher starts,
    pauses and resumes a session, as on a real chronograph; the bottom one opens Focus;
  - the power reserve ("DAY") shows how much of your day is left;
  - the moon phase at 6 o'clock is tonight's real moon, and the window below it the date.
  Cream dial, blued-steel hands, a gold case and a domed crystal. Seconds move by CSS
  animation (nothing redraws them); everything holds still when motion is reduced.
*/

const VB_W = 216
const VB_H = 204
const C = 102 // centre of the dial in the viewBox
const SERIF = "Georgia, 'Times New Roman', serif"

function useBox<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, box] as const
}

export function SidebarWatch({ collapsed }: { collapsed: boolean }) {
  const [ref, box] = useBox<HTMLDivElement>()
  const width = Math.min(collapsed ? 60 : 212, box.w, ((box.h - 16) * VB_W) / VB_H)
  const show = width >= (collapsed ? 44 : 84)
  return (
    // flex-basis 0: the watch only ever takes the room the tabs leave, never theirs
    <div ref={ref} className="flex min-h-0 flex-[1_1_0] items-center justify-center overflow-hidden">
      {show && <Watch width={width} detail={width >= 150} interactive={!collapsed} />}
    </div>
  )
}

/** Degrees → a point on a circle (0° = 12 o'clock, clockwise). */
const polar = (cx: number, cy: number, r: number, deg: number) => {
  const a = ((deg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
}

const reducedMotion = () => document.documentElement.dataset.motion === "reduced" || matchMedia("(prefers-reduced-motion: reduce)").matches

function Watch({ width, detail, interactive }: { width: number; detail: boolean; interactive: boolean }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "")
  const id = (name: string) => `${uid}-${name}`
  const router = useRouter()
  const prefs = usePrefs()
  const timer = useFocus((s) => s.timer)
  const begin = useFocus((s) => s.begin)
  const pauseTimer = useFocus((s) => s.pauseTimer)
  const resumeTimer = useFocus((s) => s.resumeTimer)
  const running = timer.status === "running"
  const now = useNow(running ? 1000 : 10_000)
  const [pressed, setPressed] = useState<"top" | "bottom" | null>(null)
  const [still] = useState(reducedMotion)

  const date = new Date(now)
  const minute = minutesOfDay(date)
  const seconds = date.getSeconds() + date.getMilliseconds() / 1000
  const hourDeg = ((date.getHours() % 12) + date.getMinutes() / 60) * 30
  const minuteDeg = (date.getMinutes() + seconds / 60) * 6
  const elapsed = timer.status === "idle" ? 0 : elapsedMs(timer, now) / 1000
  const registerDeg = ((elapsed / 60) % 60) * 6
  const dayStart = prefs?.dayStartMin ?? 7 * 60
  const dayEnd = prefs?.dayEndMin ?? 23 * 60
  const dayLeft = 1 - dayProgress(minute, dayStart, dayEnd)
  const reserveDeg = -60 + 120 * dayLeft // fan from 10 o'clock (empty) to 2 o'clock (full)
  const phase = moonPhase(date)
  const focusMin = prefs?.focus.focusMin ?? 25

  const label = [
    `Time ${formatClock(minute)}`,
    timer.status === "idle" ? "Focus not running" : `Focus ${running ? "running" : "paused"}, ${formatDuration(elapsed / 60)} in`,
    minute < dayStart ? `Your day starts at ${formatClock(dayStart)}` : minute >= dayEnd ? "Your day is over" : `${formatDuration(dayEnd - minute)} of your day left`,
    moonPhaseName(phase),
    `Date ${date.getDate()}`,
  ].join(". ")

  const topAction = () => {
    if (timer.status === "idle") {
      begin({ mode: "pomodoro", phase: "focus", minutes: focusMin })
      toast.success(`Focus started · ${focusMin} minutes`)
    } else if (running) pauseTimer()
    else resumeTimer()
  }
  const topLabel = timer.status === "idle" ? `Start a ${focusMin}-minute focus session` : running ? "Pause focus" : "Resume focus"

  /** A hand that sweeps by CSS animation, starting `offset` seconds into its turn. */
  const sweep = (cx: number, cy: number, offset: number, beats: number, paused = false): CSSProperties =>
    still
      ? { transform: `rotate(${(offset % 60) * 6}deg)`, transformOrigin: `${cx}px ${cy}px`, transformBox: "view-box" }
      : {
          transformOrigin: `${cx}px ${cy}px`,
          transformBox: "view-box",
          animationName: "watch-sweep",
          animationDuration: "60s",
          animationTimingFunction: `steps(${beats})`,
          animationIterationCount: "infinite",
          animationDelay: `-${offset % 60}s`,
          animationPlayState: paused ? "paused" : "running",
        }

  const sub = { left: { x: C - 42, y: C }, right: { x: C + 42, y: C } }
  const moon = { x: C, y: C + 37, r: 10.5 }
  const reserve = { x: C, y: C - 18, r: 14 }
  const pushers = [
    { key: "top" as const, deg: 52, label: topLabel, action: topAction },
    { key: "bottom" as const, deg: 128, label: "Open Focus", action: () => router.push("/focus") },
  ]

  return (
    <div className="relative" style={{ width, height: (width * VB_H) / VB_W }}>
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="absolute inset-0 size-full drop-shadow-[0_8px_14px_oklch(0_0_0/0.35)]" role="img" aria-label={label}>
        <defs>
          <linearGradient id={id("case")} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f6e3b4" />
            <stop offset="0.35" stopColor="#c69c55" />
            <stop offset="0.55" stopColor="#f0d597" />
            <stop offset="1" stopColor="#8e6a2e" />
          </linearGradient>
          <radialGradient id={id("bezel")} cx="0.4" cy="0.35">
            <stop offset="0.8" stopColor="#b88d47" />
            <stop offset="1" stopColor="#6f5122" />
          </radialGradient>
          <radialGradient id={id("dial")} cx="0.38" cy="0.32" r="0.75">
            <stop offset="0" stopColor="#fdf6e6" />
            <stop offset="0.6" stopColor="#f1e3c3" />
            <stop offset="1" stopColor="#dcc79b" />
          </radialGradient>
          <radialGradient id={id("sub")} cx="0.4" cy="0.35">
            <stop offset="0" stopColor="#efe0bf" />
            <stop offset="1" stopColor="#e0caa0" />
          </radialGradient>
          <linearGradient id={id("blued")} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#1a2550" />
            <stop offset="1" stopColor="#3d58a6" />
          </linearGradient>
          <radialGradient id={id("crystal")} cx="0.34" cy="0.24" r="0.65">
            <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="0.45" stopColor="#fff" stopOpacity="0.08" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <filter id={id("shadow")} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0.7" dy="1.2" stdDeviation="0.7" floodColor="#2b2116" floodOpacity="0.35" />
          </filter>
        </defs>

        {/* crown and pushers */}
        <g transform={`translate(${C + 92} ${C})`} aria-hidden>
          <rect x="0" y="-3.5" width="6" height="7" fill={`url(#${id("case")})`} />
          <rect x="5" y="-8.5" width="9" height="17" rx="2.5" fill={`url(#${id("case")})`} stroke="#6f5122" strokeWidth="0.6" />
          {[-6, -3, 0, 3, 6].map((y) => (
            <line key={y} x1="6" x2="13" y1={y} y2={y} stroke="#6f5122" strokeWidth="0.5" opacity="0.7" />
          ))}
        </g>
        {pushers.map((p) => {
          const at = polar(C, C, 95, p.deg)
          return (
            <g key={p.key} transform={`translate(${at.x} ${at.y}) rotate(${p.deg - 90})`} aria-hidden>
              <g style={{ transform: `translateX(${pressed === p.key ? -1.6 : 0}px)`, transition: "transform 0.12s ease-out" }}>
                <rect x="-2" y="-3" width="7" height="6" fill={`url(#${id("case")})`} />
                <rect x="4" y="-4.6" width="5" height="9.2" rx="1.6" fill={`url(#${id("case")})`} stroke="#6f5122" strokeWidth="0.6" />
              </g>
            </g>
          )
        })}

        {/* case, bezel, dial */}
        <circle cx={C} cy={C} r="94" fill={`url(#${id("case")})`} stroke="#6f5122" strokeWidth="1" />
        <circle cx={C} cy={C} r="89" fill={`url(#${id("bezel")})`} />
        <circle cx={C} cy={C} r="84.5" fill={`url(#${id("dial")})`} stroke="#5b4320" strokeWidth="0.6" />

        {/* railway minute track */}
        <circle cx={C} cy={C} r="81" fill="none" stroke="#2b2116" strokeWidth="0.45" opacity="0.6" />
        <circle cx={C} cy={C} r="77" fill="none" stroke="#2b2116" strokeWidth="0.45" opacity="0.6" />
        {Array.from({ length: 60 }, (_, i) => {
          const a = polar(C, C, 77, i * 6)
          const b = polar(C, C, 81, i * 6)
          return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#2b2116" strokeWidth={i % 5 === 0 ? 1 : 0.45} opacity="0.7" />
        })}

        {/* applied hour markers, and 12 */}
        {Array.from({ length: 12 }, (_, i) => i + 1)
          .filter((h) => h !== 12)
          .map((h) => {
            const a = polar(C, C, 64, h * 30)
            const b = polar(C, C, 74, h * 30)
            return (
              <g key={h}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#6d5021" strokeWidth="3.2" strokeLinecap="round" />
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#d9b56b" strokeWidth="1.6" strokeLinecap="round" />
              </g>
            )
          })}
        <text x={C} y={C - 58} textAnchor="middle" fontFamily={SERIF} fontSize="14" fontWeight="700" fill="#2b2116">
          12
        </text>

        {/* maker's mark */}
        <text x={C} y={C - 42} textAnchor="middle" fontFamily={SERIF} fontSize="7.5" letterSpacing="1.6" fill="#2b2116">
          LIFE OS
        </text>
        {detail && (
          <text x={C} y={C - 36} textAnchor="middle" fontFamily={SERIF} fontSize="3.4" letterSpacing="1.2" fill="#2b2116" opacity="0.7">
            CHRONOGRAPH
          </text>
        )}

        {/* power reserve: how much of the day is left */}
        <path d={`M${polar(reserve.x, reserve.y, reserve.r, -60).x} ${polar(reserve.x, reserve.y, reserve.r, -60).y} A${reserve.r} ${reserve.r} 0 0 1 ${polar(reserve.x, reserve.y, reserve.r, 60).x} ${polar(reserve.x, reserve.y, reserve.r, 60).y}`} fill="none" stroke="#2b2116" strokeWidth="0.6" opacity="0.7" />
        {[-60, -30, 0, 30, 60].map((d) => {
          const a = polar(reserve.x, reserve.y, reserve.r, d)
          const b = polar(reserve.x, reserve.y, reserve.r - (d % 60 === 0 ? 3 : 2), d)
          return <line key={d} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={d === -60 ? "#b3261e" : "#2b2116"} strokeWidth="0.7" />
        })}
        {detail && (
          <text x={reserve.x} y={reserve.y - 4} textAnchor="middle" fontFamily={SERIF} fontSize="3.2" letterSpacing="0.8" fill="#2b2116" opacity="0.75">
            DAY
          </text>
        )}
        <g filter={`url(#${id("shadow")})`}>
          <line x1={reserve.x} y1={reserve.y} x2={polar(reserve.x, reserve.y, reserve.r - 1.5, reserveDeg).x} y2={polar(reserve.x, reserve.y, reserve.r - 1.5, reserveDeg).y} stroke={`url(#${id("blued")})`} strokeWidth="1.1" strokeLinecap="round" />
          <circle cx={reserve.x} cy={reserve.y} r="1.6" fill="#1a2550" />
        </g>

        {/* subdials: small seconds (9) and the focus register (3) */}
        {[sub.left, sub.right].map((s, i) => (
          <g key={i}>
            <circle cx={s.x} cy={s.y} r="17" fill={`url(#${id("sub")})`} stroke="#5b4320" strokeWidth="0.5" />
            <circle cx={s.x} cy={s.y} r="12" fill="none" stroke="#2b2116" strokeWidth="0.2" opacity="0.35" />
            <circle cx={s.x} cy={s.y} r="8" fill="none" stroke="#2b2116" strokeWidth="0.2" opacity="0.3" />
            {Array.from({ length: 12 }, (_, t) => {
              const a = polar(s.x, s.y, 13.6, t * 30)
              const b = polar(s.x, s.y, 16.2, t * 30)
              return <line key={t} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={i === 1 && t === 0 ? "#b3261e" : "#2b2116"} strokeWidth={t % 3 === 0 ? 0.8 : 0.4} />
            })}
          </g>
        ))}
        {detail && (
          <>
            <text x={sub.left.x} y={sub.left.y + 9} textAnchor="middle" fontFamily={SERIF} fontSize="3.1" letterSpacing="0.6" fill="#2b2116" opacity="0.7">
              SEC
            </text>
            <text x={sub.right.x} y={sub.right.y + 9} textAnchor="middle" fontFamily={SERIF} fontSize="3.1" letterSpacing="0.6" fill="#b3261e" opacity="0.85">
              FOCUS
            </text>
          </>
        )}
        {/* small seconds: 8 beats a second */}
        <g style={sweep(sub.left.x, sub.left.y, seconds, 480)} filter={`url(#${id("shadow")})`}>
          <line x1={sub.left.x} y1={sub.left.y + 3.5} x2={sub.left.x} y2={sub.left.y - 14} stroke={`url(#${id("blued")})`} strokeWidth="0.9" strokeLinecap="round" />
        </g>
        <circle cx={sub.left.x} cy={sub.left.y} r="1.3" fill="#1a2550" />
        {/* focus register: minutes into the session */}
        <g transform={`rotate(${registerDeg} ${sub.right.x} ${sub.right.y})`} filter={`url(#${id("shadow")})`}>
          <line x1={sub.right.x} y1={sub.right.y + 3.5} x2={sub.right.x} y2={sub.right.y - 14} stroke="#b3261e" strokeWidth="0.9" strokeLinecap="round" />
        </g>
        <circle cx={sub.right.x} cy={sub.right.y} r="1.3" fill="#b3261e" />

        {/* moon phase and date */}
        <circle cx={moon.x} cy={moon.y} r={moon.r + 1.2} fill="#c9a259" stroke="#6f5122" strokeWidth="0.5" />
        <circle cx={moon.x} cy={moon.y} r={moon.r} fill="#1c2a5c" />
        {[
          [-5, -4],
          [4, -6],
          [6, 3],
          [-6, 5],
          [1, 7],
        ].map(([dx, dy], i) => (
          <circle key={i} cx={moon.x + dx} cy={moon.y + dy} r="0.45" fill="#e8c977" opacity="0.85" />
        ))}
        <circle cx={moon.x} cy={moon.y} r={moon.r * 0.62} fill="#26346c" />
        <path d={moonPath(moon.x, moon.y, moon.r * 0.62, phase)} fill="#f0d78f" />
        <rect x={C - 8} y={C + 53} width="16" height="10" rx="1" fill="#fbf7ec" stroke="#5b4320" strokeWidth="0.6" />
        <text x={C} y={C + 60.6} textAnchor="middle" fontFamily={SERIF} fontSize="7" fontWeight="700" fill="#2b2116">
          {date.getDate()}
        </text>

        {/* hour and minute hands: faceted dauphine, blued steel */}
        <g transform={`rotate(${hourDeg} ${C} ${C})`} filter={`url(#${id("shadow")})`}>
          <path d={`M${C} ${C + 10} L${C - 3.6} ${C} L${C} ${C - 44} Z`} fill="#18234a" />
          <path d={`M${C} ${C + 10} L${C + 3.6} ${C} L${C} ${C - 44} Z`} fill="#3d58a6" />
        </g>
        <g transform={`rotate(${minuteDeg} ${C} ${C})`} filter={`url(#${id("shadow")})`}>
          <path d={`M${C} ${C + 12} L${C - 2.8} ${C} L${C} ${C - 70} Z`} fill="#18234a" />
          <path d={`M${C} ${C + 12} L${C + 2.8} ${C} L${C} ${C - 70} Z`} fill="#3d58a6" />
        </g>
        {/* chronograph seconds: sweeps only while focus runs, rests at 12 otherwise */}
        <g key={running ? `run-${timer.sessionId}-${timer.resumedAt}` : timer.status} style={timer.status === "idle" ? undefined : sweep(C, C, elapsed, 480, !running)} filter={`url(#${id("shadow")})`}>
          <line x1={C} y1={C + 18} x2={C} y2={C - 80} stroke="#b3261e" strokeWidth="0.9" strokeLinecap="round" />
          <circle cx={C} cy={C + 14} r="2.6" fill="#b3261e" />
        </g>
        <circle cx={C} cy={C} r="3.8" fill={`url(#${id("case")})`} stroke="#6f5122" strokeWidth="0.4" />
        <circle cx={C} cy={C} r="1.4" fill="#b3261e" />

        {/* domed crystal */}
        <circle cx={C} cy={C} r="84.5" fill={`url(#${id("crystal")})`} pointerEvents="none" />
        <path d={`M${polar(C, C, 82, -64).x} ${polar(C, C, 82, -64).y} A82 82 0 0 1 ${polar(C, C, 82, 8).x} ${polar(C, C, 82, 8).y}`} fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" opacity="0.4" pointerEvents="none" />
      </svg>

      {interactive &&
        pushers.map((p) => {
          const at = polar(C, C, 99, p.deg)
          return (
            <Tooltip key={p.key}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={p.label}
                  onClick={p.action}
                  onPointerDown={() => setPressed(p.key)}
                  onPointerUp={() => setPressed(null)}
                  onPointerLeave={() => setPressed(null)}
                  onPointerCancel={() => setPressed(null)}
                  className="absolute size-7 -translate-x-1/2 -translate-y-1/2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{ left: `${(at.x / VB_W) * 100}%`, top: `${(at.y / VB_H) * 100}%` }}
                />
              </TooltipTrigger>
              <TooltipContent side="right">{p.label}</TooltipContent>
            </Tooltip>
          )
        })}
    </div>
  )
}
