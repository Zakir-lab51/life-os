"use client"

import { Check, ClipboardCopy, House, RotateCcw, TriangleAlert } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"

/** What to paste into a bug report: the message, where it happened, and the stack. */
export function errorDetails(error: Error & { digest?: string }, where = typeof location === "undefined" ? "" : location.pathname) {
  return [`${error.name}: ${error.message}`, where && `Page: ${where}`, error.digest && `Digest: ${error.digest}`, error.stack?.split("\n").slice(1, 8).join("\n")].filter(Boolean).join("\n")
}

/**
 * A page that crashed while rendering. The sidebar and top bar stay usable, the data is
 * untouched (it lives in this browser's IndexedDB), and the page can be tried again.
 */
export function ErrorState({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    console.error(error)
  }, [error])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(errorDetails(error))
      setCopied(true)
    } catch {
      // clipboard blocked: the details are still in the console
    }
  }

  return (
    <div role="alert" className="glass mx-auto mt-6 flex max-w-lg flex-col items-center rounded-panel p-8 text-center sm:mt-12">
      <span className="grid size-12 place-items-center rounded-2xl border border-line bg-amber/15 text-amber">
        <TriangleAlert className="size-6" />
      </span>
      <h1 className="mt-4 text-xl font-semibold tracking-tight">This page ran into a problem</h1>
      <p className="mt-2 text-sm text-muted-foreground">Your data is safe: it&apos;s stored in this browser and nothing was lost. Try again, or carry on from another page.</p>
      <p className="mt-4 max-w-full truncate rounded-xl border border-line bg-foreground/[0.04] px-3 py-1.5 font-mono text-xs text-muted-foreground" title={error.message}>
        {error.message || error.name}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button onClick={retry}>
          <RotateCcw /> Try again
        </Button>
        <Button variant="outline" asChild>
          <Link href="/">
            <House /> Overview
          </Link>
        </Button>
        <Button variant="ghost" onClick={() => void copy()}>
          {copied ? <Check /> : <ClipboardCopy />} {copied ? "Copied" : "Copy details"}
        </Button>
      </div>
    </div>
  )
}
