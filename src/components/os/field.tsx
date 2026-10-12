import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

/**
 * Label + control + inline error/help, wired up for screen readers: when the child is the
 * control itself (its id is `htmlFor`), it gets aria-invalid and aria-describedby pointing
 * at the error, or else the hint. A field with an error carries data-invalid, which
 * revealFirstError (editor-guard.tsx) uses to bring it into view after a failed save.
 */
export function Field({ label, htmlFor, error, hint, children, className }: { label: string; htmlFor?: string; error?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  const errorId = htmlFor && `${htmlFor}-error`
  const hintId = htmlFor && `${htmlFor}-hint`
  const control =
    htmlFor && isValidElement<{ id?: string }>(children) && children.props.id === htmlFor
      ? cloneElement(children as ReactElement<Record<string, unknown>>, {
          "aria-invalid": error ? true : undefined,
          "aria-describedby": error ? errorId : hint ? hintId : undefined,
        })
      : children
  return (
    <div data-invalid={error ? "" : undefined} className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {control}
      {error ? (
        <p className="text-xs font-medium text-destructive" role="alert" id={errorId || undefined}>
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground" id={hintId || undefined}>
          {hint}
        </p>
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
