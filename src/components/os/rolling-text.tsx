"use client"

import { AnimatePresence, motion } from "motion/react"
import { SPRING_SNAPPY } from "@/lib/motion"
import { cn } from "@/lib/utils"

/**
 * Text whose characters roll when they change, like the iOS clock: the old character
 * slides up and blurs away while the new one slides in from below. Each position keeps
 * the width of its current character (use tabular figures for digits).
 */
export function RollingText({ text, className }: { text: string; className?: string }) {
  return (
    <span className={cn("inline-flex", className)}>
      <span className="sr-only">{text}</span>
      <span aria-hidden className="inline-flex">
        {[...text].map((ch, i) => (
          <span key={i} className="relative inline-block">
            <span className="invisible">{ch === " " ? " " : ch}</span>
            <AnimatePresence initial={false}>
              <motion.span
                key={ch}
                className="absolute inset-0 text-center"
                initial={{ y: "55%", opacity: 0, filter: "blur(4px)" }}
                animate={{ y: "0%", opacity: 1, filter: "blur(0px)" }}
                exit={{ y: "-55%", opacity: 0, filter: "blur(4px)" }}
                transition={SPRING_SNAPPY}
              >
                {ch === " " ? " " : ch}
              </motion.span>
            </AnimatePresence>
          </span>
        ))}
      </span>
    </span>
  )
}
