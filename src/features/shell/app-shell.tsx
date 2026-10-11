"use client"

import { MotionConfig } from "motion/react"
import { useTheme } from "next-themes"
import { useEffect, type ReactNode } from "react"
import { Toaster } from "@/components/ui/sonner"
import { usePrefs } from "@/lib/db/hooks"
import { applyDesign } from "@/lib/design/design"
import { SPRING } from "@/lib/motion"
import { setThemeColor } from "@/lib/theme-color"
import { TaskEditorDialog } from "@/features/tasks/task-editor"
import { HabitEditorDialog } from "@/features/habits/habit-editor"
import { GoalDetailDialog } from "@/features/goals/goal-detail"
import { GoalEditorDialog } from "@/features/goals/goal-editor"
import { BlockEditorDialog } from "@/features/planner/block-editor"
import { PlanMyDayDialog } from "@/features/planner/plan-dialog"
import { ReflectionDialog } from "@/features/planner/reflection-dialog"
import { OnboardingWizard } from "@/features/onboarding/onboarding-wizard"
import { ClientGate } from "./client-gate"
import { CommandPalette } from "./command-palette"
import { FocusEngine, ProgressWatcher, ReminderEngine } from "./engines"
import { GlassPointer } from "./glass-pointer"
import { OfflineSupport } from "./offline"
import { QualityMonitor } from "./quality-monitor"
import { QuickCapture } from "./quick-capture"
import { Backdrop } from "./refraction"
import { ShortcutsDialog, useGlobalShortcuts } from "./shortcuts"
import { SmoothScroll } from "./smooth-scroll"
import { Sidebar } from "./sidebar"
import { Topbar } from "./topbar"

/** Soft colour behind the photo. It holds still on purpose: anything moving under the
    glass makes every glass surface re-blur on every frame, which costs smooth scrolling. */
function Aurora() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -top-[30%] -left-[15%] h-[70vh] w-[70vw] rounded-full blur-3xl" style={{ background: "radial-gradient(closest-side, var(--aurora-1), transparent)" }} />
      <div className="absolute -right-[20%] -bottom-[35%] h-[70vh] w-[65vw] rounded-full blur-3xl" style={{ background: "radial-gradient(closest-side, var(--aurora-2), transparent)" }} />
    </div>
  )
}

function Shell({ children }: { children: ReactNode }) {
  const prefs = usePrefs()
  useGlobalShortcuts()

  useEffect(() => {
    if (prefs?.motion === "reduced") document.documentElement.dataset.motion = "reduced"
    else delete document.documentElement.dataset.motion
  }, [prefs?.motion])

  // the status bar strip (iPad home-screen app) and browser chrome follow the app's theme
  const { resolvedTheme } = useTheme()
  useEffect(() => {
    if (resolvedTheme) setThemeColor(resolvedTheme === "dark" ? "dark" : "light")
  }, [resolvedTheme])

  // the saved design (accent, roundness, glass…) drives the CSS variables in globals.css
  const design = prefs?.design
  useEffect(() => {
    if (design) applyDesign(design)
  }, [design])

  return (
    <MotionConfig reducedMotion={prefs?.motion === "reduced" ? "always" : "user"} transition={SPRING}>
      <a href="#main" className="sr-only z-50 rounded-control bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Skip to content
      </a>
      <Aurora />
      <Backdrop liquid={prefs?.design.material === "liquid"} photo={prefs?.design.photo ?? "none"} hue={prefs?.design.hue ?? 0} saturation={prefs?.design.saturation ?? 1} />
      <GlassPointer />
      <QualityMonitor />
      <SmoothScroll reduced={prefs?.motion === "reduced"} />
      <OfflineSupport />
      <div className="flex min-h-dvh">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main id="main" tabIndex={-1} className="@container/main mx-auto w-full max-w-[1400px] flex-1 px-4 pt-6 pb-20 outline-none sm:px-6 lg:px-8">
            {children}
          </main>
        </div>
      </div>

      <CommandPalette />
      <QuickCapture />
      <TaskEditorDialog />
      <HabitEditorDialog />
      <GoalDetailDialog />
      <GoalEditorDialog />
      <BlockEditorDialog />
      <PlanMyDayDialog />
      <ReflectionDialog />
      <ShortcutsDialog />
      {prefs && !prefs.onboarded && <OnboardingWizard />}

      <FocusEngine />
      <ReminderEngine />
      <ProgressWatcher />
      <Toaster position="bottom-right" closeButton richColors={false} />
    </MotionConfig>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ClientGate>
      <Shell>{children}</Shell>
    </ClientGate>
  )
}
