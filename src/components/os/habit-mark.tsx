"use client"

import { Check } from "lucide-react"
import type { CSSProperties } from "react"
import { Icon } from "@/components/os/icon"
import { ACCENT_CLASSES } from "@/lib/domain/areas"
import type { Habit } from "@/lib/domain/types"
import { useJustChanged } from "@/lib/use-just-changed"
import { cn } from "@/lib/utils"

/** A habit's round mark: its icon, or a check once done. It pops when you check in (not on load). */
export function HabitMark({ habit, done, className }: { habit: Pick<Habit, "icon" | "color">; done: boolean; className?: string }) {
  const changed = useJustChanged(done)
  const tone = ACCENT_CLASSES[habit.color]
  return (
    <span
      data-pop={(changed && done) || undefined}
      style={{ "--pop-ring": tone.fill } as CSSProperties}
      className={cn("pop relative grid shrink-0 place-items-center rounded-full transition-colors", done ? cn(tone.bg, "text-primary-foreground") : cn(tone.soft, tone.text), className)}
    >
      {done ? <Check className="size-4" strokeWidth={3} /> : <Icon name={habit.icon} className="size-4" />}
    </span>
  )
}
