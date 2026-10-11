"use client"

import { CalendarPlus, NotebookPen, Plus, Repeat, Timer, WandSparkles, Zap, type LucideIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { useCallback } from "react"
import { toast } from "sonner"
import { usePrefs } from "@/lib/db/hooks"
import { downloadText, exportBackup } from "@/lib/db/backup"
import { todayISO } from "@/lib/domain/dates"
import type { QuickActionId } from "@/lib/domain/types"
import { attempt } from "@/lib/feedback"
import { useFocus } from "@/lib/stores/focus"
import { useUI } from "@/lib/stores/ui"

export const QUICK_ACTION_META: Record<QuickActionId, { label: string; description: string; icon: LucideIcon; keys?: string }> = {
  task: { label: "New task", description: "Full task editor", icon: Plus, keys: "N" },
  capture: { label: "Quick capture", description: "Type it, tag it, done", icon: Zap, keys: "Q" },
  habit: { label: "New habit", description: "Start tracking a habit", icon: Repeat },
  block: { label: "Time block", description: "Add to today's timeline", icon: CalendarPlus },
  focus: { label: "Start focus", description: "Begin a focus session", icon: Timer },
  plan: { label: "Plan my day", description: "Suggest a schedule for free time", icon: WandSparkles },
  reflection: { label: "Daily reflection", description: "Wins and lessons from today", icon: NotebookPen },
}

export function useActions() {
  const router = useRouter()
  const prefs = usePrefs()
  const { resolvedTheme, setTheme } = useTheme()

  const run = useCallback(
    (id: QuickActionId) => {
      const ui = useUI.getState()
      ui.setPalette(false)
      switch (id) {
        case "task":
          ui.openTaskEditor(null)
          break
        case "capture":
          ui.setCapture(true)
          break
        case "habit":
          ui.openHabitEditor(null)
          break
        case "block":
          ui.openBlockEditor({ date: ui.plannerDate ?? todayISO() })
          break
        case "focus": {
          const focus = useFocus.getState()
          if (focus.timer.status === "idle") {
            focus.begin({ mode: "pomodoro", phase: "focus", minutes: prefs?.focus.focusMin ?? 25 })
            toast.success(`Focus started · ${prefs?.focus.focusMin ?? 25} minutes`)
          }
          router.push("/focus")
          break
        }
        case "plan":
          router.push("/today")
          ui.setPlanOpen(true)
          break
        case "reflection":
          ui.setReflectionOpen(true)
          break
      }
    },
    [prefs, router],
  )

  const toggleTheme = useCallback(() => setTheme(resolvedTheme === "dark" ? "light" : "dark"), [resolvedTheme, setTheme])

  const downloadBackup = useCallback(async () => {
    const backup = await attempt(() => exportBackup())
    if (!backup) return
    downloadText(`life-os-backup-${todayISO()}.json`, JSON.stringify(backup, null, 2))
    toast.success("Backup downloaded")
  }, [])

  return { run, toggleTheme, downloadBackup, navigate: (href: string) => router.push(href) }
}
