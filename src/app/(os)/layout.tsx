import type { ReactNode } from "react"
import { AppShell } from "@/features/shell/app-shell"

/**
 * LIFE OS pages render in the browser from IndexedDB, so the server only
 * prerenders the boot screen (see ClientGate). That also lets the whole app be
 * exported as static files for GitHub Pages.
 */

export default function OSLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>
}
