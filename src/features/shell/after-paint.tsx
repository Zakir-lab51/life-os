"use client"

import { useEffect, useState, type ReactNode } from "react"

/**
 * Renders its children once the page has painted and the browser has a free moment
 * (within 1.5 s), so background helpers don't add to the work before the first screen.
 */
export function AfterPaint({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 300))
    const id = idle(() => setReady(true), { timeout: 1500 })
    return () => (window.cancelIdleCallback ?? window.clearTimeout)(id)
  }, [])
  return ready ? <>{children}</> : null
}
