"use client"

import { useEffect } from "react"
import "./globals.css"

/**
 * Last resort, when the app shell itself crashed: it replaces the whole document, so it
 * brings its own <html> and styles. The data is untouched (it lives in IndexedDB).
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])
  return (
    <html lang="en" className="dark">
      <body className="grid min-h-dvh place-items-center bg-background p-6 font-sans text-foreground">
        <title>LIFE OS needs a reload</title>
        <main role="alert" className="max-w-md rounded-panel border border-line bg-surface-2 p-8 text-center">
          <h1 className="text-xl font-semibold tracking-tight">LIFE OS ran into a problem</h1>
          <p className="mt-2 text-sm text-muted-foreground">Your data is safe: it&apos;s stored in this browser and nothing was lost. Reloading usually fixes it.</p>
          <p className="mt-4 truncate font-mono text-xs text-muted-foreground">{error.message || error.name}</p>
          <div className="mt-6 flex justify-center gap-2">
            <button type="button" onClick={() => window.location.reload()} className="rounded-control bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
              Reload
            </button>
            <button type="button" onClick={retry} className="rounded-control border border-line px-4 py-2 text-sm font-medium">
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  )
}
