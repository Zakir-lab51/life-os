"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import { safeStorage } from "./safe-storage"
import type { GoalInput, HabitInput, TaskInput } from "@/lib/validation/schemas"
import type { ID, ISODate } from "@/lib/domain/types"

export type TaskView = "list" | "board"

interface UIState {
  sidebarCollapsed: boolean
  mobileNavOpen: boolean
  /** The edge the navigation drawer slides in from: the side of the button that opened it. */
  mobileNavSide: "left" | "right"
  paletteOpen: boolean
  captureOpen: boolean
  shortcutsOpen: boolean
  taskEditor: { open: boolean; taskId: ID | null; defaults: Partial<TaskInput> | null }
  habitEditor: { open: boolean; habitId: ID | null; defaults: Partial<HabitInput> | null }
  blockEditor: { open: boolean; blockId: ID | null; date: ISODate | null; start: number | null }
  goalEditor: { open: boolean; goalId: ID | null; defaults: Partial<GoalInput> | null }
  /** The goal shown in the goal detail sheet. */
  openGoalId: ID | null
  planOpen: boolean
  reflectionOpen: boolean
  /** null = today */
  plannerDate: ISODate | null
  taskView: TaskView

  toggleSidebar: () => void
  setMobileNav: (open: boolean, side?: "left" | "right") => void
  setPalette: (open: boolean) => void
  setCapture: (open: boolean) => void
  setShortcuts: (open: boolean) => void
  openTaskEditor: (taskId?: ID | null, defaults?: Partial<TaskInput>) => void
  closeTaskEditor: () => void
  openHabitEditor: (habitId?: ID | null, defaults?: Partial<HabitInput>) => void
  closeHabitEditor: () => void
  openBlockEditor: (opts: { blockId?: ID | null; date?: ISODate | null; start?: number | null }) => void
  closeBlockEditor: () => void
  openGoalEditor: (goalId?: ID | null, defaults?: Partial<GoalInput>) => void
  closeGoalEditor: () => void
  showGoal: (goalId: ID | null) => void
  setPlanOpen: (open: boolean) => void
  setReflectionOpen: (open: boolean) => void
  setPlannerDate: (date: ISODate | null) => void
  setTaskView: (view: TaskView) => void
}

export const useUI = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      mobileNavOpen: false,
      mobileNavSide: "left",
      paletteOpen: false,
      captureOpen: false,
      shortcutsOpen: false,
      taskEditor: { open: false, taskId: null, defaults: null },
      habitEditor: { open: false, habitId: null, defaults: null },
      blockEditor: { open: false, blockId: null, date: null, start: null },
      goalEditor: { open: false, goalId: null, defaults: null },
      openGoalId: null,
      planOpen: false,
      reflectionOpen: false,
      plannerDate: null,
      taskView: "list",

      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setMobileNav: (open, side) => set(side ? { mobileNavOpen: open, mobileNavSide: side } : { mobileNavOpen: open }),
      setPalette: (open) => set({ paletteOpen: open }),
      setCapture: (open) => set({ captureOpen: open }),
      setShortcuts: (open) => set({ shortcutsOpen: open }),
      openTaskEditor: (taskId = null, defaults) => set({ taskEditor: { open: true, taskId, defaults: defaults ?? null }, paletteOpen: false }),
      closeTaskEditor: () => set((s) => ({ taskEditor: { ...s.taskEditor, open: false } })),
      openHabitEditor: (habitId = null, defaults) => set({ habitEditor: { open: true, habitId, defaults: defaults ?? null }, paletteOpen: false }),
      closeHabitEditor: () => set((s) => ({ habitEditor: { ...s.habitEditor, open: false } })),
      openBlockEditor: ({ blockId = null, date = null, start = null }) => set({ blockEditor: { open: true, blockId, date, start }, paletteOpen: false }),
      closeBlockEditor: () => set((s) => ({ blockEditor: { ...s.blockEditor, open: false } })),
      openGoalEditor: (goalId = null, defaults) => set({ goalEditor: { open: true, goalId, defaults: defaults ?? null }, paletteOpen: false }),
      closeGoalEditor: () => set((s) => ({ goalEditor: { ...s.goalEditor, open: false } })),
      showGoal: (goalId) => set({ openGoalId: goalId, paletteOpen: false }),
      setPlanOpen: (open) => set({ planOpen: open, paletteOpen: false }),
      setReflectionOpen: (open) => set({ reflectionOpen: open, paletteOpen: false }),
      setPlannerDate: (date) => set({ plannerDate: date }),
      setTaskView: (view) => set({ taskView: view }),
    }),
    {
      name: "life-os.ui",
      storage: safeStorage,
      skipHydration: true,
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed, taskView: s.taskView }),
    },
  ),
)
