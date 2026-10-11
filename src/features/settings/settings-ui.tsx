"use client"

import { Check, ChevronRight, Minus, Plus, X } from "lucide-react"
import { useState, type KeyboardEvent, type ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { RollingText } from "@/components/os/rolling-text"
import { cn } from "@/lib/utils"

/*
  Building blocks for Settings, after Apple's System Settings: inset grouped lists of
  rows (label on the left, control on the right, hairline dividers that start after
  the icon), coloured icon tiles, and compact controls such as the stepper.
*/

/** A rounded, colour-filled square holding a white glyph, like an iOS settings icon. */
export function IconTile({ icon: I, color, size = "md", className }: { icon: LucideIcon; color: string; size?: "sm" | "md" | "lg"; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center text-white shadow-[inset_0_1px_0_oklch(1_0_0/0.35),0_1px_2px_oklch(0_0_0/0.18)]",
        size === "sm" && "size-6 rounded-[7px] [&_svg]:size-3.5",
        size === "md" && "size-7 rounded-[8px] [&_svg]:size-4",
        size === "lg" && "size-12 rounded-[14px] [&_svg]:size-6",
        className,
      )}
      style={{ background: `linear-gradient(180deg, color-mix(in oklch, ${color} 82%, white), ${color})` }}
    >
      <I strokeWidth={2.2} />
    </span>
  )
}

/** An inset grouped list. Header and footer sit outside the rounded group, like iOS. */
export function Group({ title, footer, children, className, id }: { title?: ReactNode; footer?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cn("scroll-mt-28", className)}>
      {title && <h3 className="mb-1.5 px-4 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">{title}</h3>}
      <div className="overflow-hidden rounded-[calc(var(--radius)*1.15)] bg-surface-2/60 ring-1 ring-line">{children}</div>
      {footer && <p className="mt-1.5 px-4 text-xs leading-relaxed text-muted-foreground">{footer}</p>}
    </section>
  )
}

const rowBase =
  "relative flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left before:absolute before:top-0 before:right-0 before:left-4 before:h-px before:bg-line first:before:hidden"

/**
 * One row of a group. Pass `control` for a switch/stepper on the right, or `onClick` to
 * make the whole row a button with a chevron. `inset` lines the divider up with the text
 * when the row has an icon.
 */
export function Row({
  icon,
  label,
  description,
  control,
  onClick,
  id,
  tone,
  htmlFor,
  children,
  className,
}: {
  icon?: ReactNode
  label: ReactNode
  description?: ReactNode
  control?: ReactNode
  onClick?: () => void
  id?: string
  tone?: "danger" | "accent"
  htmlFor?: string
  children?: ReactNode
  className?: string
}) {
  const body = (
    <>
      {icon}
      <span className="min-w-0 flex-1">
        <span className={cn("block text-sm", tone === "danger" && "text-destructive", tone === "accent" && "text-violet")}>{htmlFor ? <label htmlFor={htmlFor}>{label}</label> : label}</span>
        {description && <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>}
        {children}
      </span>
      {control && <span className="flex shrink-0 items-center gap-2">{control}</span>}
      {onClick && !control && <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />}
    </>
  )
  const cls = cn(rowBase, icon && "before:left-14", className)
  if (onClick)
    return (
      <button type="button" id={id} onClick={onClick} className={cn(cls, "scroll-mt-28 transition-colors hover:bg-foreground/[0.04] active:bg-foreground/[0.07]")}>
        {body}
      </button>
    )
  return (
    <div id={id} className={cn(cls, "scroll-mt-28")}>
      {body}
    </div>
  )
}

/** A row in a pick-one list: a checkmark marks the chosen option. */
export function ChoiceRow({ label, description, selected, onSelect }: { label: ReactNode; description?: ReactNode; selected: boolean; onSelect: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={onSelect} className={cn(rowBase, "transition-colors hover:bg-foreground/[0.04] active:bg-foreground/[0.07]")}>
      <span className="min-w-0 flex-1">
        <span className="block text-sm">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>}
      </span>
      <Check className={cn("size-4 shrink-0 text-violet transition-[opacity,scale] duration-300 ease-(--ease-spring-bouncy)", selected ? "scale-100 opacity-100" : "scale-50 opacity-0")} strokeWidth={2.75} />
    </button>
  )
}

/**
 * − value + control. Values roll as they change; arrow keys, Page Up/Down, Home and End
 * work on the focused value.
 */
export function Stepper({ value, min, max, step = 1, onChange, format = String, label }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string; label: string }) {
  const set = (v: number) => {
    const next = Math.min(max, Math.max(min, Math.round(v / step) * step))
    if (next !== value) onChange(next)
  }
  const keys = (e: KeyboardEvent) => {
    const moves: Record<string, number> = { ArrowUp: value + step, ArrowRight: value + step, ArrowDown: value - step, ArrowLeft: value - step, PageUp: value + step * 5, PageDown: value - step * 5, Home: min, End: max }
    if (!(e.key in moves)) return
    e.preventDefault()
    set(moves[e.key])
  }
  const btn = "pressable grid size-7 place-items-center rounded-full text-foreground/80 hover:bg-foreground/[0.07] disabled:pointer-events-none disabled:opacity-35"
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-surface-3/70 p-0.5 ring-1 ring-line">
      <button type="button" className={btn} aria-label={`Decrease ${label}`} disabled={value <= min} onClick={() => set(value - step)}>
        <Minus className="size-3.5" strokeWidth={2.5} />
      </button>
      <span
        role="spinbutton"
        tabIndex={0}
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuetext={format(value)}
        onKeyDown={keys}
        className="min-w-16 rounded-full px-1 text-center text-sm font-medium tabular outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <RollingText text={format(value)} />
      </span>
      <button type="button" className={btn} aria-label={`Increase ${label}`} disabled={value >= max} onClick={() => set(value + step)}>
        <Plus className="size-3.5" strokeWidth={2.5} />
      </button>
    </span>
  )
}

/** Tags you can add and remove; Enter adds. */
export function ChipEditor({ values, onChange, placeholder, max, label }: { values: string[]; onChange: (v: string[]) => void; placeholder: string; max: number; label: string }) {
  const [draft, setDraft] = useState("")
  const add = () => {
    const v = draft.trim().slice(0, 120)
    if (v && !values.includes(v) && values.length < max) onChange([...values, v])
    setDraft("")
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-4 py-3">
      {values.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded-full bg-surface-3/80 py-1 pr-1 pl-3 text-sm ring-1 ring-line">
          {v}
          <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))} className="pressable grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground">
            <X className="size-3" />
          </button>
        </span>
      ))}
      {values.length < max && (
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return
            e.preventDefault()
            add()
          }}
          onBlur={add}
          placeholder={placeholder}
          aria-label={label}
          maxLength={120}
          className="h-8 w-44 flex-1 rounded-full border-0 bg-transparent px-2 shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
      )}
    </div>
  )
}
