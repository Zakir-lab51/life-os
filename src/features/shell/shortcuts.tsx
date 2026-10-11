"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Kbd } from "@/components/os/visuals"
import { useUI } from "@/lib/stores/ui"
import { useActions } from "./actions"
import { NAV } from "./nav"

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || !!el.closest("[role=dialog],[role=menu],[role=listbox]")
}

/** Global keyboard shortcuts. Single keys are ignored while typing or when a dialog is open. */
export function useGlobalShortcuts() {
  const router = useRouter()
  const { run } = useActions()
  const pendingG = useRef<number | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ui = useUI.getState()
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        ui.setPalette(!ui.paletteOpen)
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return

      if (pendingG.current !== null) {
        window.clearTimeout(pendingG.current)
        pendingG.current = null
        const item = NAV.find((n) => n.shortcut === e.key.toLowerCase())
        if (item) {
          e.preventDefault()
          router.push(item.href)
        }
        return
      }

      switch (e.key) {
        case "g":
          pendingG.current = window.setTimeout(() => (pendingG.current = null), 1200)
          break
        case "n":
          e.preventDefault()
          run("task")
          break
        case "q":
          e.preventDefault()
          run("capture")
          break
        case "[":
          ui.toggleSidebar()
          break
        case "?":
          ui.setShortcuts(true)
          break
        case "/":
          e.preventDefault()
          ui.setPalette(true)
          break
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [router, run])
}

const GROUPS: { title: string; items: [string[], string][] }[] = [
  {
    title: "Anywhere",
    items: [
      [["Ctrl", "K"], "Command palette (⌘K on Mac)"],
      [["/"], "Search"],
      [["Q"], "Quick capture"],
      [["N"], "New task"],
      [["["], "Collapse sidebar"],
      [["?"], "This help"],
    ],
  },
  {
    title: "Go to",
    items: NAV.filter((n) => n.shortcut).map((n) => [["G", n.shortcut!.toUpperCase()], n.label] as [string[], string]),
  },
  {
    title: "Focus page",
    items: [
      [["Space"], "Start / pause the timer"],
      [["F"], "Distraction-free fullscreen"],
    ],
  },
  {
    title: "Tasks page",
    items: [
      [["L"], "List view"],
      [["B"], "Board view"],
    ],
  },
]

export function ShortcutsDialog() {
  const open = useUI((s) => s.shortcutsOpen)
  const setOpen = useUI((s) => s.setShortcuts)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="rounded-dialog p-6 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Single-key shortcuts pause while you&apos;re typing.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 sm:grid-cols-2">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <p className="mb-2 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">{g.title}</p>
              <ul className="space-y-1.5">
                {g.items.map(([keys, label]) => (
                  <li key={label} className="flex items-center justify-between gap-3 text-sm">
                    <span>{label}</span>
                    <span className="flex gap-1">
                      {keys.map((k) => (
                        <Kbd key={k}>{k}</Kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
