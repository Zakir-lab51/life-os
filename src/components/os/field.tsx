import type { ReactNode } from "react"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

/** Label + control + inline error/help, wired up for screen readers. */
export function Field({ label, htmlFor, error, hint, children, className }: { label: string; htmlFor?: string; error?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
      {error ? (
        <p className="text-xs font-medium text-destructive" role="alert" id={htmlFor ? `${htmlFor}-error` : undefined}>
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

/** Pill-style single choice, used for priorities, schedules and modes. */
export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  className,
  ariaLabel,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode; title?: string }[]
  className?: string
  ariaLabel: string
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("inline-flex flex-wrap gap-1 rounded-control border border-line bg-surface-2/70 p-1", className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-control px-3 py-1.5 text-xs font-medium transition-all",
            value === o.value ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
