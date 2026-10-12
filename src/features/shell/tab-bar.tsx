"use client"

import { Menu } from "lucide-react"
import { motion } from "motion/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { SPRING_SNAPPY } from "@/lib/motion"
import { useUI } from "@/lib/stores/ui"
import { cn } from "@/lib/utils"
import { NAV, navForPath, type NavKey } from "./nav"

/*
  Phones: a floating glass tab bar at the bottom, within thumb reach, instead of the
  desktop sidebar squeezed into a drawer. The four most-used places, plus More, which
  opens the full drawer. Each target is a 64 px column; the highlighter glides between
  them. Hidden from 768 px up, where the top bar's drawer and the sidebar take over.
*/
const TABS: NavKey[] = ["overview", "today", "tasks", "habits"]

export function TabBar() {
  const pathname = usePathname()
  const active = navForPath(pathname)
  const setMobileNav = useUI((s) => s.setMobileNav)
  const elsewhere = !TABS.includes(active.key)

  const cell = "pressable relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[1.4rem] text-[10px] font-semibold outline-none [--press-scale:0.92] focus-visible:ring-2 focus-visible:ring-ring"
  return (
    <nav aria-label="Tabs" className="glass fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 flex h-16 items-stretch gap-1 rounded-[1.75rem] p-1.5 md:hidden">
      {NAV.filter((n) => TABS.includes(n.key)).map((item) => {
        const on = item.key === active.key
        const I = item.icon
        return (
          <Link key={item.key} href={item.href} aria-current={on ? "page" : undefined} className={cn(cell, on ? "text-pill-foreground" : "text-foreground/70")}>
            {on && <motion.span layoutId="tab-active" className="glass-pill absolute inset-0 rounded-[1.4rem]" transition={SPRING_SNAPPY} />}
            <I className="relative size-5" strokeWidth={on ? 2.4 : 2} />
            <span className="relative max-w-full truncate">{item.label}</span>
          </Link>
        )
      })}
      <button type="button" onClick={() => setMobileNav(true)} aria-label="More: all sections" className={cn(cell, elsewhere ? "text-pill-foreground" : "text-foreground/70")}>
        {elsewhere && <motion.span layoutId="tab-active" className="glass-pill absolute inset-0 rounded-[1.4rem]" transition={SPRING_SNAPPY} />}
        <Menu className="relative size-5" />
        <span className="relative max-w-full truncate">{elsewhere ? active.label : "More"}</span>
      </button>
    </nav>
  )
}
