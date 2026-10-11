"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import { safeStorage } from "./safe-storage"
import type { HabitInput, TaskInput } from "@/lib/validation/schemas"
import type { ID, ISODate } from "@/lib/domain/types"

export type TaskView = "list" | "board"

interface UIState {
  sidebarCollapsed: boolean
  mobileNavOpen: boolean
  paletteOpen: boolean
  captureOpen: boolean
  shortcutsOpen: boolean
  taskEditor: { open: boolean; taskId: ID | null; defaults: Partial<TaskInput> | null }
  habitEditor: { open: boolean; habitId: ID | null; defaults: Partial<HabitInput> | null }
  blockEditor: { open: boolean; blockId: ID | null; date: ISODate | null; start: number | null }
  planOpen: boolean
  reflectionOpen: boolean
  /** null = today */
  plannerDate: ISODate | null
  taskView: TaskView

  toggleSidebar: () => void
  setMobileNav: (open: boolean) => void
  setPalette: (open: boolean) => void
  setCapture: (open: boolean) => void
  setShortcuts: (open: boolean) => void
  openTaskEditor: (taskId?: ID | null, defaults?: Partial<TaskInput>) => void
  closeTaskEditor: () => void
  openHabitEditor: (habitId?: ID | null, defaults?: Partial<HabitInput>) => void
  closeHabitEditor: () => void
  openBlockEditor: (opts: { blockId?: ID | null; date?: ISODate | null; start?: number | null }) => void
  closeBlockEditor: () => void
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
      paletteOpen: false,
      captureOpen: false,
      shortcutsOpen: false,
      taskEditor: { open: false, taskId: null, defaults: null },
      habitEditor: { open: false, habitId: null, defaults: null },
      blockEditor: { open: false, blockId: null, date: null, start: null },
      planOpen: false,
      reflectionOpen: false,
      plannerDate: null,
      taskView: "list",

      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setMobileNav: (open) => set({ mobileNavOpen: open }),
      setPalette: (open) => set({ paletteOpen: open }),
      setCapture: (open) => set({ captureOpen: open }),
      setShortcuts: (open) => set({ shortcutsOpen: open }),
      openTaskEditor: (taskId = null, defaults) => set({ taskEditor: { open: true, taskId, defaults: defaults ?? null }, paletteOpen: false }),
      closeTaskEditor: () => set((s) => ({ taskEditor: { ...s.taskEditor, open: false } })),
      openHabitEditor: (habitId = null, defaults) => set({ habitEditor: { open: true, habitId, defaults: defaults ?? null }, paletteOpen: false }),
      closeHabitEditor: () => set((s) => ({ habitEditor: { ...s.habitEditor, open: false } })),
      openBlockEditor: ({ blockId = null, date = null, start = null }) => set({ blockEditor: { open: true, blockId, date, start }, paletteOpen: false }),
      closeBlockEditor: () => set((s) => ({ blockEditor: { ...s.blockEditor, open: false } })),
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
