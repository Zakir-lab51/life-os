"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
import { usePrefs } from "@/lib/db/hooks"
import { useUI } from "@/lib/stores/ui"

/*
  The app-wide dialogs load the first time they open instead of with every page: they were
  all in the shell, and the goal dialog alone brought the charts library (338 KB) onto My
  Day, Tasks and Settings. Once the app has settled they're fetched in the background, so
  the first open is still instant; once opened, a dialog stays mounted so it can animate out.
*/
const load = {
  palette: () => import("./command-palette").then((m) => m.CommandPalette),
  capture: () => import("./quick-capture").then((m) => m.QuickCapture),
  task: () => import("@/features/tasks/task-editor").then((m) => m.TaskEditorDialog),
  habit: () => import("@/features/habits/habit-editor").then((m) => m.HabitEditorDialog),
  goal: () => import("@/features/goals/goal-detail").then((m) => m.GoalDetailDialog),
  goalEditor: () => import("@/features/goals/goal-editor").then((m) => m.GoalEditorDialog),
  block: () => import("@/features/planner/block-editor").then((m) => m.BlockEditorDialog),
  plan: () => import("@/features/planner/plan-dialog").then((m) => m.PlanMyDayDialog),
  reflection: () => import("@/features/planner/reflection-dialog").then((m) => m.ReflectionDialog),
}

const CommandPalette = dynamic(load.palette, { ssr: false })
const QuickCapture = dynamic(load.capture, { ssr: false })
const TaskEditorDialog = dynamic(load.task, { ssr: false })
const HabitEditorDialog = dynamic(load.habit, { ssr: false })
const GoalDetailDialog = dynamic(load.goal, { ssr: false })
const GoalEditorDialog = dynamic(load.goalEditor, { ssr: false })
const BlockEditorDialog = dynamic(load.block, { ssr: false })
const PlanMyDayDialog = dynamic(load.plan, { ssr: false })
const ReflectionDialog = dynamic(load.reflection, { ssr: false })
const OnboardingWizard = dynamic(() => import("@/features/onboarding/onboarding-wizard").then((m) => m.OnboardingWizard), { ssr: false })

/** Fetches one dialog ahead of its first open (the Goals page warms the goal dialog). */
export function warmDialog(name: keyof typeof load) {
  const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 300))
  idle(() => void load[name]().catch(() => undefined), { timeout: 2000 })
}

/** True from the first time `open` is true, and from then on. */
function useOnceOpened(open: boolean) {
  const [opened, setOpened] = useState(open)
  if (open && !opened) setOpened(true)
  return opened || open
}

export function LazyDialogs() {
  const ui = useUI()
  const prefs = usePrefs()
  const show = {
    palette: useOnceOpened(ui.paletteOpen),
    capture: useOnceOpened(ui.captureOpen),
    task: useOnceOpened(ui.taskEditor.open),
    habit: useOnceOpened(ui.habitEditor.open),
    goal: useOnceOpened(ui.openGoalId !== null),
    goalEditor: useOnceOpened(ui.goalEditor.open),
    block: useOnceOpened(ui.blockEditor.open),
    plan: useOnceOpened(ui.planOpen),
    reflection: useOnceOpened(ui.reflectionOpen),
  }

  // fetch the everyday ones once the app has settled, so opening one never waits (not the
  // goal dialog: it opens from Goals and brings the charts library, which a phone shouldn't
  // parse unasked)
  useEffect(() => {
    const warm = () => Object.entries(load).forEach(([name, l]) => name !== "goal" && void l().catch(() => undefined))
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 2500))
    const id = idle(warm, { timeout: 4000 })
    return () => (window.cancelIdleCallback ?? window.clearTimeout)(id)
  }, [])

  return (
    <>
      {show.palette && <CommandPalette />}
      {show.capture && <QuickCapture />}
      {show.task && <TaskEditorDialog />}
      {show.habit && <HabitEditorDialog />}
      {show.goal && <GoalDetailDialog />}
      {show.goalEditor && <GoalEditorDialog />}
      {show.block && <BlockEditorDialog />}
      {show.plan && <PlanMyDayDialog />}
      {show.reflection && <ReflectionDialog />}
      {prefs && !prefs.onboarded && <OnboardingWizard />}
    </>
  )
}
