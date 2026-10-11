"use client"

import { DatabaseZap } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { ensurePrefs } from "@/lib/db/repo"
import { useFocus } from "@/lib/stores/focus"
import { useUI } from "@/lib/stores/ui"
import { LifeMark } from "./sidebar"

/**
 * LIFE OS keeps all data in the browser, so nothing personal is rendered on
 * the server. The server sends this boot screen; the app mounts once
 * IndexedDB is open.
 */
export function ClientGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"boot" | "ready" | "error">("boot")

  useEffect(() => {
    let alive = true
    ;(async () => {
      await ensurePrefs()
      await Promise.all([useUI.persist.rehydrate(), useFocus.persist.rehydrate()])
      if (alive) setState("ready")
    })().catch((e) => {
      console.error(e)
      if (alive) setState("error")
    })
    return () => {
      alive = false
    }
  }, [])

  if (state === "ready") return <>{children}</>
  if (state === "error") {
    return (
      <div className="grid min-h-dvh place-items-center p-6">
        <div className="glass max-w-md rounded-panel p-8 text-center">
          <DatabaseZap className="mx-auto size-8 text-amber" />
          <h1 className="mt-4 text-xl font-semibold">LIFE OS couldn&apos;t open its storage</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your data lives in this browser&apos;s IndexedDB. Private/incognito windows and some privacy settings block it. Try a normal window, or allow site data for this page.
          </p>
          <Button className="mt-6" onClick={() => window.location.reload()}>
            Try again
          </Button>
        </div>
      </div>
    )
  }
  return <BootScreen />
}

function BootScreen() {
  return (
    <div className="grid min-h-dvh place-items-center" aria-busy="true" aria-label="Loading LIFE OS">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="absolute inset-0 animate-breathe rounded-full bg-violet/40 blur-2xl" />
          <LifeMark className="relative size-14" />
        </div>
        <p className="text-sm tracking-[0.2em] text-muted-foreground uppercase">LIFE OS</p>
      </div>
    </div>
  )
}
