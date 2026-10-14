"use client"

import { MotionConfig } from "motion/react"
import { useTheme } from "next-themes"
import { useEffect, type ReactNode } from "react"
import { Toaster } from "@/components/ui/sonner"
import { LifeDataProvider, usePrefs } from "@/lib/db/hooks"
import { applyDesign } from "@/lib/design/design"
import { SPRING } from "@/lib/motion"
import { setThemeColor } from "@/lib/theme-color"
import { AfterPaint } from "./after-paint"
import { ClientGate } from "./client-gate"
import { FocusEngine, ProgressWatcher, ReminderEngine } from "./engines"
import { GlassPointer } from "./glass-pointer"
import { LazyDialogs } from "./lazy-dialogs"
import { OfflineSupport } from "./offline"
import { QualityMonitor } from "./quality-monitor"
import { Backdrop } from "./refraction"
import { ShortcutsDialog, useGlobalShortcuts } from "./shortcuts"
import { SmoothScroll } from "./smooth-scroll"
import { Sidebar } from "./sidebar"
import { TabBar } from "./tab-bar"
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
      <SmoothScroll reduced={prefs?.motion === "reduced"} />
      {/* helpers that can start a moment after the first screen */}
      <AfterPaint>
        <GlassPointer />
        <QualityMonitor />
        <OfflineSupport />
        <FocusEngine />
        <ReminderEngine />
        <ProgressWatcher />
      </AfterPaint>
      <div className="flex min-h-dvh">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main id="main" tabIndex={-1} className="@container/main mx-auto w-full max-w-[1400px] flex-1 px-4 pt-6 pb-[calc(6.5rem+env(safe-area-inset-bottom))] outline-none sm:px-6 md:pb-20 lg:px-8">
            {children}
          </main>
        </div>
      </div>
      <TabBar />

      <LazyDialogs />
      <ShortcutsDialog />

      <Toaster position="bottom-right" closeButton richColors={false} mobileOffset={{ bottom: "calc(env(safe-area-inset-bottom) + 5.5rem)" }} />
    </MotionConfig>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ClientGate>
      <LifeDataProvider>
        <Shell>{children}</Shell>
      </LifeDataProvider>
    </ClientGate>
  )
}
