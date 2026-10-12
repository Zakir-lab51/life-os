"use client"

import { useEffect, useRef, useState, type RefObject } from "react"
import { Button } from "@/components/ui/button"

/**
 * Editors (task, goal, habit, time block) close on Escape, a click outside or ✕. With
 * unsaved changes that used to throw the typing away; now the dialog stays open and asks
 * first. Saving, Cancel and Discard close straight away: they're deliberate.
 */
export interface CloseGuard {
  /** Whether the form has unsaved changes (kept current by useUnsaved). */
  dirty: RefObject<boolean>
  /** The "discard your changes?" question is showing. */
  asking: boolean
  keepEditing: () => void
  /** Closes for real: after a save, on Cancel, or on Discard. */
  close: () => void
  /** What the dialog does when asked to close; a second request while asking means "keep editing". */
  requestClose: () => void
}

export function useCloseGuard(close: () => void): CloseGuard {
  const dirty = useRef(false)
  const [asking, setAsking] = useState(false)
  return {
    dirty,
    asking,
    keepEditing: () => setAsking(false),
    close: () => {
      setAsking(false)
      dirty.current = false
      close()
    },
    requestClose: () => {
      if (asking) setAsking(false)
      else if (dirty.current) setAsking(true)
      else close()
    },
  }
}

/** Tells the guard whether `value` (the form's fields) differs from what the form opened with. */
export function useUnsaved(guard: CloseGuard, value: unknown) {
  const [initial] = useState(() => JSON.stringify(value))
  const dirty = JSON.stringify(value) !== initial
  const { dirty: ref } = guard
  useEffect(() => {
    ref.current = dirty
  }, [ref, dirty])
  return dirty
}

/** Covers the editor's footer while it asks whether to throw away unsaved changes. Put it last in a `relative` form. */
export function DiscardBar({ guard }: { guard: CloseGuard }) {
  if (!guard.asking) return null
  return (
    <div role="group" aria-label="Unsaved changes" className="absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-center gap-2 border-t border-line bg-popover px-6 py-4 animate-in fade-in-0 slide-in-from-bottom-2">
      <p className="mr-auto text-sm font-medium" role="status">
        Discard your changes?
      </p>
      <Button type="button" variant="ghost" onClick={guard.close}>
        Discard
      </Button>
      <Button type="button" autoFocus onClick={guard.keepEditing}>
        Keep editing
      </Button>
    </div>
  )
}

/**
 * After a failed save, moves focus to the first field with an error and brings it into
 * view, so the message is seen and heard. Fields mark themselves with data-invalid (Field).
 */
export function revealFirstError(from: Element | null = typeof document === "undefined" ? null : document.activeElement) {
  const form = from?.closest("form")
  requestAnimationFrame(() => {
    const field = form?.querySelector<HTMLElement>("[data-invalid]")
    if (!field) return
    const control = field.querySelector<HTMLElement>("input, textarea, select, button, [tabindex]:not([tabindex='-1'])")
    control?.focus({ preventScroll: true })
    field.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })
  })
}
