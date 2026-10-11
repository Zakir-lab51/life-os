"use client"

import { motion, useReducedMotion } from "motion/react"
import type { ReactNode } from "react"

/**
 * The focus visualisation: a progress ring around a softly breathing orb.
 * The ring fills as the session advances; the glow slowly turns while running.
 */
export function FocusOrb({ progress, running, tone, size = 320, children }: { progress: number | null; running: boolean; tone: "focus" | "break"; size?: number; children: ReactNode }) {
  const reduce = useReducedMotion()
  const stroke = 10
  const r = size / 2 - stroke - 6
  const c = 2 * Math.PI * r
  const color = tone === "focus" ? "var(--violet)" : "var(--mint)"
  const pct = progress === null ? 0 : Math.max(0, Math.min(1, progress))

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <motion.div
        aria-hidden
        className="absolute inset-[12%] rounded-full blur-3xl"
        style={{ background: `conic-gradient(from 0deg, ${color}, var(--cyan), var(--blue), ${color})`, opacity: running ? 0.45 : 0.22 }}
        animate={reduce || !running ? undefined : { rotate: 360 }}
        transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
      />
      <motion.div
        aria-hidden
        className="absolute inset-[18%] rounded-full border border-line"
        style={{ background: `radial-gradient(circle at 35% 30%, color-mix(in oklch, ${color} 30%, transparent), color-mix(in oklch, var(--background) 92%, transparent) 70%)` }}
        animate={reduce || !running ? undefined : { scale: [1, 1.025, 1] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      />
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        {progress !== null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - pct)}
            style={{ transition: "stroke-dashoffset 0.6s linear", filter: `drop-shadow(0 0 10px ${color})` }}
          />
        )}
        {progress === null &&
          running &&
          Array.from({ length: 60 }, (_, i) => {
            const a = (i / 60) * 2 * Math.PI
            const x1 = size / 2 + Math.cos(a) * (r - 4)
            const y1 = size / 2 + Math.sin(a) * (r - 4)
            const x2 = size / 2 + Math.cos(a) * (r + 4)
            const y2 = size / 2 + Math.sin(a) * (r + 4)
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--line)" strokeWidth={i % 5 === 0 ? 2 : 1} />
          })}
      </svg>
      <div className="relative z-10 text-center">{children}</div>
    </div>
  )
}
