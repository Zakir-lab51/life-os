"use client"

import type { LucideIcon } from "lucide-react"
import { motion, type HTMLMotionProps } from "motion/react"
import type { ReactNode } from "react"
import { ACCENT_CLASSES } from "@/lib/domain/areas"
import type { AccentColor } from "@/lib/domain/types"
import { RISE } from "@/lib/motion"
import { cn } from "@/lib/utils"

const TAGS = { section: motion.section, div: motion.div, article: motion.article }

/** A glass tile. Inside a PageTransition it rises into place in turn with the others. */
export function Panel({ className, children, as = "section", ...props }: Omit<HTMLMotionProps<"section">, "ref"> & { as?: keyof typeof TAGS }) {
  const Tag = TAGS[as]
  return (
    <Tag variants={RISE} className={cn("@container glass relative flex flex-col rounded-panel p-5 sm:p-6", className)} {...props}>
      {children}
    </Tag>
  )
}

export function IconBadge({ icon: I, tone = "violet", className, size = "md" }: { icon: LucideIcon; tone?: AccentColor; className?: string; size?: "sm" | "md" | "lg" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full",
        ACCENT_CLASSES[tone].bg,
        "text-primary-foreground",
        size === "sm" && "size-8 [&_svg]:size-4",
        size === "md" && "size-11 [&_svg]:size-5",
        size === "lg" && "size-14 [&_svg]:size-6",
        className,
      )}
    >
      <I strokeWidth={2.2} />
    </span>
  )
}

export function PanelHeader({
  title,
  subtitle,
  icon,
  tone,
  action,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  icon?: LucideIcon
  tone?: AccentColor
  action?: ReactNode
  className?: string
}) {
  return (
    <header className={cn("mb-4 flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="text-[1.15rem] leading-tight font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {action}
        {icon && <IconBadge icon={icon} tone={tone} />}
      </div>
    </header>
  )
}
