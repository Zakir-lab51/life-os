import type { Metadata } from "next"
import Link from "next/link"
import { LifeMark } from "@/features/shell/sidebar"

export const metadata: Metadata = { title: "Page not found" }

/** Any address the app doesn't have (also written out as 404.html for GitHub Pages). */
export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="glass flex max-w-md flex-col items-center rounded-panel p-8 text-center">
        <LifeMark className="size-12" />
        <h1 className="mt-4 text-xl font-semibold tracking-tight">There&apos;s no page here</h1>
        <p className="mt-2 text-sm text-muted-foreground">The address may be mistyped, or the page has moved. Everything you&apos;ve saved is still in LIFE OS.</p>
        <Link href="/" className="pressable mt-6 rounded-control bg-primary px-4 py-2 text-sm font-medium text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Go to Overview
        </Link>
      </div>
    </main>
  )
}
