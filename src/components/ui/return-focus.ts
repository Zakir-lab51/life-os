import { useState } from "react"

/*
  Radix dialogs hand focus back on close only to their own Trigger. LIFE OS opens
  dialogs from elsewhere (the top bar, menus, keyboard shortcuts, other dialogs), so
  without this focus fell to <body> on close and keyboard and screen-reader users lost
  their place. This remembers what had focus as a dialog opened and returns focus there
  on close, unless the caller already moved it or that element has gone.
*/
export function returnFocus() {
  let opener: HTMLElement | null = null
  return {
    remember() {
      const active = document.activeElement
      opener = active instanceof HTMLElement && active !== document.body ? active : null
    },
    restore(event: Event) {
      const target = opener
      opener = null
      if (event.defaultPrevented || !target?.isConnected) return
      event.preventDefault()
      target.focus({ preventScroll: true })
    },
  }
}

/** Focus handlers for a dialog's Content, composed with any the caller passed. */
export function useReturnFocus(onOpenAutoFocus?: (event: Event) => void, onCloseAutoFocus?: (event: Event) => void) {
  const [focus] = useState(returnFocus)
  return {
    onOpenAutoFocus: (event: Event) => {
      focus.remember()
      onOpenAutoFocus?.(event)
    },
    onCloseAutoFocus: (event: Event) => {
      onCloseAutoFocus?.(event)
      focus.restore(event)
    },
  }
}
