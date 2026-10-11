"use client"

import { motion } from "motion/react"
import type { ReactNode } from "react"
import { RISE } from "@/lib/motion"
import { cn } from "@/lib/utils"

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  eyebrow?: ReactNode
  className?: string
}) {
  return (
    <motion.div
      variants={RISE}
      className={cn("mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}
    >
      <div className="min-w-0">
        {eyebrow && <div className="mb-2 text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">{eyebrow}</div>}
        <h1 className="text-[1.9rem] leading-[1.1] font-semibold tracking-tight sm:text-[2.2rem]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-[0.95rem] text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </motion.div>
  )
}

/**
 * Brings a page in on first mount: the title and each tile (Panel) rise into place one
 * after another. The wrapper itself never fades: fading it would stop the tiles' glass
 * from blurring the background while it animates.
 */
export function PageTransition({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.045, delayChildren: 0.02 } } }} className={className}>
      {children}
    </motion.div>
  )
}
