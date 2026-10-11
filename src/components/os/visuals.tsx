"use client"

import { motion } from "motion/react"
import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { RollingText } from "@/components/os/rolling-text"
import { ACCENT_CLASSES, AREA_META, PRIORITY_META } from "@/lib/domain/areas"
import type { AccentColor, Area, Priority } from "@/lib/domain/types"
import { cn } from "@/lib/utils"

/** Circular gauge. `value` is 0–100; null renders an empty dashed ring. */
export function RingGauge({
  value,
  size = 132,
  stroke = 10,
  tone = "violet",
  children,
  label,
}: {
  value: number | null
  size?: number
  stroke?: number
  tone?: AccentColor
  children?: ReactNode
  label?: string
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value)) / 100
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label ?? (value === null ? "No data yet" : `${Math.round(value)} out of 100`)}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} strokeDasharray={value === null ? "3 6" : undefined} />
        {value !== null && (
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={ACCENT_CLASSES[tone].fill}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            initial={{ strokeDashoffset: c }}
            animate={{ strokeDashoffset: c * (1 - pct) }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          />
        )}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  )
}

/** Progress bar with the hatched "remaining" track from the reference design. */
export function HatchBar({ value, tone = "lilac", className, height = 10 }: { value: number; tone?: AccentColor; className?: string; height?: number }) {
  const pct = Math.max(0, Math.min(1, value))
  return (
    <div className={cn("hatch relative w-full overflow-hidden rounded-full", ACCENT_CLASSES[tone].soft, className)} style={{ height }} role="progressbar" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100}>
      <motion.div
        className={cn("absolute inset-y-0 left-0 rounded-full", ACCENT_CLASSES[tone].bg)}
        initial={{ width: 0 }}
        animate={{ width: `${pct * 100}%` }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  )
}

/** Identity comes from the coloured dot; the label stays in the text colour so it's always legible. */
export function AreaBadge({ area, className }: { area: Area; className?: string }) {
  const meta = AREA_META[area]
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-control bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted-foreground", className)}>
      <span className="size-1.5 rounded-full" style={{ background: meta.color }} />
      {meta.label}
    </span>
  )
}

export function PriorityFlag({ priority, showLabel = false, className }: { priority: Priority; showLabel?: boolean; className?: string }) {
  const meta = PRIORITY_META[priority]
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground", priority === 1 && "text-foreground", className)} title={`${meta.label} priority`}>
      <span className={cn("size-2 rounded-full", ACCENT_CLASSES[meta.color].bg, priority === 4 && "opacity-60")} />
      {showLabel ? meta.label : meta.short}
    </span>
  )
}

export function Chip({ children, className, icon: I }: { children: ReactNode; className?: string; icon?: LucideIcon }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-control bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted-foreground", className)}>
      {I && <I className="size-3" />}
      {children}
    </span>
  )
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-line bg-surface-2 px-1.5 font-mono text-[10px] font-medium text-muted-foreground", className)}>
      {children}
    </kbd>
  )
}

export function EmptyState({
  icon: I,
  title,
  body,
  action,
  className,
  compact = false,
}: {
  icon: LucideIcon
  title: string
  body?: ReactNode
  action?: ReactNode
  className?: string
  compact?: boolean
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "gap-2 py-6" : "gap-3 py-12", className)}>
      <div className="relative grid place-items-center">
        <div className="absolute size-16 animate-breathe rounded-full bg-violet/15 blur-xl" />
        <span className={cn("relative grid place-items-center rounded-2xl border border-line bg-surface-2 text-violet", compact ? "size-10" : "size-12")}>
          <I className={compact ? "size-5" : "size-6"} />
        </span>
      </div>
      <div>
        <p className="font-medium">{title}</p>
        {body && <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>}
      </div>
      {action}
    </div>
  )
}

/** Big tabular number with an optional faded denominator, like "16/25" in the reference. */
export function Fraction({ value, total, className }: { value: number; total?: number; className?: string }) {
  return (
    <span className={cn("tabular font-semibold tracking-tight", className)}>
      {value}
      {total !== undefined && <span className="text-muted-foreground/40">/{total}</span>}
    </span>
  )
}

export function StatTile({ label, value, sub, tone = "violet", icon: I }: { label: string; value: ReactNode; sub?: ReactNode; tone?: AccentColor; icon?: LucideIcon }) {
  return (
    <div className="rounded-2xl border border-line bg-surface-2/60 p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {I && <I className={cn("size-3.5", ACCENT_CLASSES[tone].text)} />}
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight tabular">{typeof value === "number" || typeof value === "string" ? <RollingText text={String(value)} /> : value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  )
}
