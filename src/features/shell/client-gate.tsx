"use client"

import { DatabaseZap } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { readSync } from "@/lib/db/cloud"
import { SYNCED, initDatabase } from "@/lib/db/db"
import { ensurePrefs } from "@/lib/db/repo"
import { useFocus } from "@/lib/stores/focus"
import { useUI } from "@/lib/stores/ui"
import { CloudLoginDialog, SyncGate } from "@/features/sync/sync-ui"
import { LifeMark } from "./sidebar"

/**
 * LIFE OS keeps all data in the browser, so nothing personal is rendered on
 * the server. The server sends this boot screen; the app mounts once
 * IndexedDB is open.
 */
export function ClientGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"boot" | "sync" | "ready" | "error">("boot")
  const [boots, setBoots] = useState(0)
  // the sync sign-in dialog reads the database, so it waits until it's ready
  const [opened, setOpened] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      await initDatabase()
      if (alive) setOpened(true)
      // a device that has just turned sync on signs in and downloads first (see lib/db/cloud.ts)
      if (SYNCED && !readSync()?.ready) {
        if (alive) setState("sync")
        return
      }
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
  }, [boots])

  return (
    <>
      {SYNCED && opened && <CloudLoginDialog />}
      <GateScreen state={state} onSynced={() => (setState("boot"), setBoots((b) => b + 1))}>
        {children}
      </GateScreen>
    </>
  )
}

function GateScreen({ state, onSynced, children }: { state: "boot" | "sync" | "ready" | "error"; onSynced: () => void; children: ReactNode }) {
  if (state === "sync") return <SyncGate onReady={onSynced} />
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
