"use client"

import { useRouter } from "next/navigation"
import { useEffect, useId, useRef, useState, type CSSProperties } from "react"
import { toast } from "sonner"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useNow, usePrefs } from "@/lib/db/hooks"
import { moonPath } from "@/lib/domain/moon"
import { watchReadout } from "@/lib/domain/watch"
import { useFocus } from "@/lib/stores/focus"

/*
  A digital watch at the foot of the sidebar, in whatever room the tabs leave (none when
  there's too little). Drawn flat: a rounded case with a colour rim, a crown and a side
  button, and a dark screen showing
  - the day and date, and tonight's moon;
  - the time, with a track round the screen's edge that fills once a minute (the seconds);
  - focus: a bar filling through the session with the time left (or "Focus · 25m");
  - how much of your day is left.
  The crown starts, pauses and resumes a focus session (so does tapping the focus bar);
  the side button opens Focus. The seconds move by CSS animation, one step a second
  (nothing redraws them); the rest updates once a minute, or every second while a session
  runs. Everything holds still when motion is reduced. Text: watchReadout (lib/domain/watch.ts).
*/

const VB_W = 212
const VB_H = 220
const X = 96 // centre line of the screen

/** A rounded rectangle traced clockwise from the middle of its top edge. */
const roundRect = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + w / 2} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`

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
  const width = Math.min(collapsed ? 60 : 196, box.w, ((box.h - 16) * VB_W) / VB_H)
  const show = width >= (collapsed ? 44 : 84)
  return (
    // flex-basis 0: the watch only ever takes the room the tabs leave, never theirs
    <div ref={ref} className="flex min-h-0 flex-[1_1_0] items-center justify-center overflow-hidden">
      {show && <Watch width={width} detail={width >= 140} interactive={!collapsed} />}
    </div>
  )
}

const reducedMotion = () => document.documentElement.dataset.motion === "reduced" || matchMedia("(prefers-reduced-motion: reduce)").matches

/** Paint from a CSS colour token (SVG presentation attributes can't take var()). */
const paint = (fill: string): CSSProperties => ({ fill })

function Watch({ width, detail, interactive }: { width: number; detail: boolean; interactive: boolean }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "")
  const id = (name: string) => `${uid}-${name}`
  const router = useRouter()
  const prefs = usePrefs()
  const timer = useFocus((s) => s.timer)
  const begin = useFocus((s) => s.begin)
  const pauseTimer = useFocus((s) => s.pauseTimer)
  const resumeTimer = useFocus((s) => s.resumeTimer)
  // the minute is enough, unless a session's countdown is showing
  const now = useNow(timer.status === "running" ? 1000 : 60_000)
  const [pressed, setPressed] = useState<"crown" | "button" | null>(null)
  const [still] = useState(reducedMotion)
  // where in the minute the seconds track starts (to the millisecond, so it steps with the clock)
  const [startSec] = useState(() => (Date.now() % 60_000) / 1000)

  const date = new Date(now)
  const focusMin = prefs?.focus.focusMin ?? 25
  const r = watchReadout(date, timer, { dayStart: prefs?.dayStartMin ?? 7 * 60, dayEnd: prefs?.dayEndMin ?? 23 * 60, focusMin })

  const focusAction = () => {
    if (timer.status === "idle") {
      begin({ mode: "pomodoro", phase: "focus", minutes: focusMin })
      toast.success(`Focus started · ${focusMin} minutes`)
    } else if (timer.status === "running") pauseTimer()
    else resumeTimer()
  }
  const focusLabel = timer.status === "idle" ? `Start a ${focusMin}-minute focus session` : timer.status === "running" ? "Pause focus" : "Resume focus"
  const accent = r.focus.rest ? "var(--mint)" : "var(--violet)"

  // the seconds track: 60 steps round the screen's edge, by CSS animation from the current second
  const track = roundRect(23, 23, 146, 174, 35)
  const secondsStyle: CSSProperties = still
    ? { strokeDashoffset: 60 - date.getSeconds() }
    : { animation: `watch-seconds 60s steps(60) -${startSec.toFixed(3)}s infinite` }

  const bar = { x: 36, y: 147, w: 120, h: 24 }
  const day = { x: 64, y: 183, w: 92 }

  const press = (key: "crown" | "button") => ({
    onPointerDown: () => setPressed(key),
    onPointerUp: () => setPressed(null),
    onPointerLeave: () => setPressed(null),
    onPointerCancel: () => setPressed(null),
  })
  const at = (x: number, y: number): CSSProperties => ({ left: `${(x / VB_W) * 100}%`, top: `${(y / VB_H) * 100}%` })

  return (
    <div className="relative" style={{ width, height: (width * VB_H) / VB_W }}>
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="absolute inset-0 size-full drop-shadow-[0_10px_18px_oklch(0_0_0/0.32)]" role="img" aria-label={r.label}>
        <defs>
          <linearGradient id={id("rim")} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: "var(--cyan)" }} />
            <stop offset="0.5" style={{ stopColor: "var(--violet)" }} />
            <stop offset="1" style={{ stopColor: "var(--rose)" }} />
          </linearGradient>
          <linearGradient id={id("secs")} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: "var(--cyan)" }} />
            <stop offset="1" style={{ stopColor: "var(--violet)" }} />
          </linearGradient>
          <linearGradient id={id("focus")} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" style={{ stopColor: accent }} />
            <stop offset="1" style={{ stopColor: r.focus.rest ? "var(--cyan)" : "var(--rose)" }} />
          </linearGradient>
          <clipPath id={id("bar")}>
            <rect x={bar.x} y={bar.y} width={bar.w} height={bar.h} rx={bar.h / 2} />
          </clipPath>
        </defs>

        {/* crown (ridged) and side button, behind the case's edge */}
        <g transform={pressed === "crown" ? "translate(-2 0)" : undefined} style={{ transition: "transform 120ms var(--ease-out)" }}>
          <rect x="180" y="60" width="20" height="38" rx="6" fill={`url(#${id("rim")})`} />
          {[69, 75, 81, 87].map((y) => (
            <line key={y} x1="191" x2="198" y1={y} y2={y} stroke="oklch(0 0 0 / 0.28)" strokeWidth="1.6" strokeLinecap="round" />
          ))}
        </g>
        <rect x="180" y="112" width="14" height="46" rx="5" transform={pressed === "button" ? "translate(-2 0)" : undefined} style={{ fill: "oklch(0.34 0.03 285)", transition: "transform 120ms var(--ease-out)" }} />

        {/* case: a flat graphite body with a colour rim */}
        <path d={roundRect(4, 4, 184, 212, 54)} style={{ fill: "oklch(0.25 0.025 285)" }} />
        <path d={roundRect(5.5, 5.5, 181, 209, 52.5)} fill="none" stroke={`url(#${id("rim")})`} strokeWidth="3" />

        {/* screen */}
        <path d={roundRect(15, 15, 162, 190, 43)} style={{ fill: "oklch(0.12 0.02 285)" }} />
        <path d={track} fill="none" stroke="oklch(1 0 0 / 0.08)" strokeWidth="3" />
        <path d={track} fill="none" stroke={`url(#${id("secs")})`} strokeWidth="3" strokeLinecap="round" pathLength={60} strokeDasharray="60 60" style={secondsStyle} />

        {detail && (
          <>
            {/* day and date, and tonight's moon */}
            <text x="38" y="52" fontSize="11.5" fontWeight="800" letterSpacing="1.4" style={{ fontFamily: "var(--font-ui)" }}>
              <tspan style={paint("var(--lilac)")}>{r.weekday}</tspan>
              <tspan dx="5" style={paint("oklch(1 0 0 / 0.92)")}>
                {r.day}
              </tspan>
            </text>
            <circle cx="152" cy="48" r="7.5" style={{ fill: "oklch(1 0 0 / 0.1)" }} />
            <path d={moonPath(152, 48, 7.5, r.moon)} style={{ fill: "oklch(0.93 0.06 95)" }} />
          </>
        )}

        {/* the time, the colon in the accent */}
        <text
          x={X}
          y={detail ? 112 : 126}
          textAnchor="middle"
          fontSize={detail ? 50 : 62}
          fontWeight="800"
          letterSpacing="-1.5"
          style={{ fontFamily: "var(--font-ui)", fontVariantNumeric: "tabular-nums", fill: "oklch(1 0 0 / 0.96)" }}
        >
          {r.hour}
          <tspan style={paint("var(--violet)")}>:</tspan>
          {r.minute}
        </text>
        {detail && r.period && (
          <text x={X} y="130" textAnchor="middle" fontSize="10" fontWeight="800" letterSpacing="2.4" style={{ fontFamily: "var(--font-ui)", fill: "oklch(1 0 0 / 0.55)" }}>
            {r.period}
          </text>
        )}

        {detail && (
          <>
            {/* focus: fills through the session */}
            <rect x={bar.x} y={bar.y} width={bar.w} height={bar.h} rx={bar.h / 2} style={{ fill: timer.status === "idle" ? "oklch(1 0 0 / 0.08)" : "oklch(1 0 0 / 0.1)" }} />
            {r.focus.progress !== null && (
              <rect clipPath={`url(#${id("bar")})`} x={bar.x} y={bar.y} width={Math.max(bar.h, bar.w * r.focus.progress)} height={bar.h} fill={`url(#${id("focus")})`} opacity={timer.status === "paused" ? 0.55 : 1} />
            )}
            {r.focus.progress === null && timer.status !== "idle" && <rect x={bar.x} y={bar.y} width={bar.w} height={bar.h} rx={bar.h / 2} fill={`url(#${id("focus")})`} opacity="0.85" />}
            {timer.status === "running" ? (
              <g style={paint("oklch(1 0 0 / 0.95)")}>
                <rect x="47" y="154" width="3.2" height="10" rx="1" />
                <rect x="53" y="154" width="3.2" height="10" rx="1" />
              </g>
            ) : (
              <path d="M47.5 153.5 L56.5 159 L47.5 164.5 Z" strokeLinejoin="round" style={{ fill: timer.status === "idle" ? accent : "oklch(1 0 0 / 0.95)" }} />
            )}
            <text x="104" y="163" textAnchor="middle" fontSize="11.5" fontWeight="800" letterSpacing="0.4" style={{ fontFamily: "var(--font-ui)", fontVariantNumeric: "tabular-nums", fill: timer.status === "idle" ? "oklch(1 0 0 / 0.75)" : "oklch(1 0 0 / 0.97)" }}>
              {r.focus.text}
            </text>

            {/* the day still ahead */}
            <text x="38" y="188" fontSize="8.5" fontWeight="800" letterSpacing="1.6" style={{ fontFamily: "var(--font-ui)", fill: "oklch(1 0 0 / 0.5)" }}>
              DAY
            </text>
            <rect x={day.x} y="182.5" width={day.w} height="5" rx="2.5" style={{ fill: "oklch(1 0 0 / 0.1)" }} />
            {r.dayLeft > 0 && <rect x={day.x} y="182.5" width={Math.max(5, day.w * r.dayLeft)} height="5" rx="2.5" style={paint("var(--mint)")} />}
          </>
        )}
      </svg>

      {interactive && (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={focusLabel}
                onClick={focusAction}
                {...press("crown")}
                className="absolute size-8 -translate-x-1/2 -translate-y-1/2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={at(191, 79)}
              />
            </TooltipTrigger>
            <TooltipContent side="right">{focusLabel}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Open Focus"
                onClick={() => router.push("/focus")}
                {...press("button")}
                className="absolute h-11 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={at(188, 135)}
              />
            </TooltipTrigger>
            <TooltipContent side="right">Open Focus</TooltipContent>
          </Tooltip>
          {detail && (
            // the focus bar does what the crown does (for pointers; the crown is the keyboard's way in)
            <button
              type="button"
              tabIndex={-1}
              aria-hidden
              onClick={focusAction}
              className="absolute rounded-full"
              style={{ ...at(bar.x, bar.y), width: `${(bar.w / VB_W) * 100}%`, height: `${(bar.h / VB_H) * 100}%` }}
            />
          )}
        </>
      )}
    </div>
  )
}
