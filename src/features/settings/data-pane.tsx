"use client"

import { FileJson, FileSpreadsheet, HardDrive, RotateCcw, ShieldCheck, Sparkles, Trash2, Upload } from "lucide-react"
import { useLiveQuery } from "dexie-react-hooks"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SYNCED } from "@/lib/db/db"
import { backupCounts, downloadText, exportBackup, exportTasksCSV, parseBackup, restoreBackup } from "@/lib/db/backup"
import { hasDemoData, removeDemo, seedDemo } from "@/lib/db/demo"
import { ensurePrefs, updatePrefs, wipeAllData } from "@/lib/db/repo"
import { todayISO } from "@/lib/domain/dates"
import { attempt, reportError, succeeded } from "@/lib/feedback"
import type { Backup } from "@/lib/validation/schemas"
import { quietly } from "@/features/shell/progress"
import { SyncGroup } from "@/features/sync/sync-ui"
import { Group, IconTile, Row } from "./settings-ui"

const bytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`)

/** How much this browser stores for LIFE OS, and whether it's protected from automatic clean-up. */
function useStorage() {
  const [usage, setUsage] = useState<number | null>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  useEffect(() => {
    const s = navigator.storage
    if (!s) return
    s.estimate?.().then((e) => setUsage(e.usage ?? null), () => setUsage(null))
    s.persisted?.().then(setPersisted, () => setPersisted(null))
  }, [])
  const protect = async () => {
    const granted = await navigator.storage?.persist?.()
    setPersisted(!!granted)
    if (granted) toast.success("Storage protected", { description: "The browser won't clear LIFE OS to free up space." })
    else toast("The browser didn't allow it this time", { description: "Browsers grant this more readily to sites you use often or install." })
  }
  const canProtect = typeof navigator !== "undefined" && typeof navigator.storage?.persist === "function"
  return { usage, persisted, protect, canProtect }
}

export function DataPane() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<Backup | null>(null)
  const [confirmWipe, setConfirmWipe] = useState(false)
  const [wipeText, setWipeText] = useState("")
  const [busy, setBusy] = useState(false)
  const demo = useLiveQuery(() => hasDemoData(), [])
  const storage = useStorage()

  const download = async () => {
    const b = await attempt(() => exportBackup())
    if (!b) return
    downloadText(`life-os-backup-${todayISO()}.json`, JSON.stringify(b, null, 2))
    toast.success("Backup downloaded", { description: "Keep it somewhere safe; it contains all your data." })
  }
  const downloadCSV = async () => {
    const csv = await attempt(() => exportTasksCSV())
    if (csv === undefined) return
    downloadText(`life-os-tasks-${todayISO()}.csv`, csv, "text/csv")
    toast.success("Tasks exported as CSV")
  }
  const pick = async (file: File | undefined) => {
    if (!file) return
    if (file.size > 25 * 1024 * 1024) return toast.error("That file is larger than 25 MB, too big for a LIFE OS backup")
    try {
      setPending(parseBackup(await file.text()))
    } catch (e) {
      reportError(e)
    } finally {
      if (fileRef.current) fileRef.current.value = ""
    }
  }
  const restore = async () => {
    if (!pending) return
    setBusy(true)
    const ok = await succeeded(() =>
      quietly(async () => {
        await restoreBackup(pending)
        await ensurePrefs()
      }),
    )
    if (ok) toast.success("Backup restored")
    setPending(null)
    setBusy(false)
  }
  const toggleDemo = async () => {
    setBusy(true)
    if (demo) {
      if (await succeeded(() => removeDemo())) toast.success("Demo data removed", { description: "Your own records were left untouched." })
    } else if (await succeeded(() => quietly(() => seedDemo()))) {
      toast.success("Demo data loaded", { description: "Every sample record is tagged demo." })
    }
    setBusy(false)
  }
  const wipe = async () => {
    setBusy(true)
    if (await succeeded(() => wipeAllData())) {
      await ensurePrefs()
      toast.success("Everything was deleted")
    }
    setConfirmWipe(false)
    setWipeText("")
    setBusy(false)
  }

  return (
    <>
      <SyncGroup />

      <Group id="s-storage" title="Storage" footer="Browsers can clear a site's data when space runs low. Protecting storage asks this browser to keep LIFE OS.">
        <Row icon={<IconTile icon={HardDrive} color="#8e8e93" />} label="Stored in this browser" description="Tasks, habits, history and settings (IndexedDB)" control={<span className="text-sm text-muted-foreground tabular">{storage.usage === null ? "…" : bytes(storage.usage)}</span>} />
        <Row
          id="s-protect"
          icon={<IconTile icon={ShieldCheck} color="#34c759" />}
          label="Protect from automatic clean-up"
          control={
            storage.persisted ? (
              <span className="rounded-full bg-mint/20 px-2 py-0.5 text-[11px] font-medium">Protected</span>
            ) : (
              <Button size="sm" variant="outline" className="rounded-full" disabled={!storage.canProtect} onClick={() => void storage.protect()}>
                Protect
              </Button>
            )
          }
        />
      </Group>

      <Group id="s-backup" title="Backup" footer="Back up regularly: clearing this site's data in your browser deletes LIFE OS.">
        <Row icon={<IconTile icon={FileJson} color="#0a84ff" />} label="Download backup" description="Everything, as a JSON file you can restore later" onClick={() => void download()} />
        <Row id="s-restore" icon={<IconTile icon={Upload} color="#5e5ce6" />} label="Restore from backup…" description={SYNCED ? "Replaces all current data, on all your synced devices; you'll confirm first" : "Replaces all current data; you'll confirm first"} onClick={() => fileRef.current?.click()} />
        <Row id="s-csv" icon={<IconTile icon={FileSpreadsheet} color="#34c759" />} label="Export tasks as CSV" description="Open your tasks in any spreadsheet app" onClick={() => void downloadCSV()} />
      </Group>
      <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} aria-label="Choose a backup file" tabIndex={-1} />

      <Group title="Exploring">
        <Row
          id="s-demo"
          icon={<IconTile icon={Sparkles} color="#ff9f0a" />}
          label={demo ? "Remove demo data" : "Load demo data"}
          description={demo ? "Deletes only records marked demo" : "Nine weeks of clearly labelled sample data"}
          onClick={busy || demo === undefined ? undefined : () => void toggleDemo()}
          control={busy || demo === undefined ? <span className="text-xs text-muted-foreground">Working…</span> : undefined}
        />
        <Row id="s-setup" icon={<IconTile icon={RotateCcw} color="#30b0c7" />} label="Run setup again" description="Revisit the onboarding questions; your data stays" onClick={() => void attempt(() => updatePrefs({ onboarded: false }))} />
      </Group>

      <Group footer="Permanently erases all LIFE OS data in this browser. Download a backup first if you might want it back.">
        <Row id="s-delete" icon={<IconTile icon={Trash2} color="#ff3b30" />} label="Delete all data…" description={SYNCED ? "On all your synced devices" : undefined} tone="danger" onClick={() => setConfirmWipe(true)} />
      </Group>

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this backup?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p>
                  Made {pending ? new Date(pending.exportedAt).toLocaleString() : ""}. It will <strong>replace everything</strong> currently in LIFE OS:
                </p>
                {pending && (
                  <ul className="mt-2 grid grid-cols-2 gap-1 text-sm">
                    {Object.entries(backupCounts(pending)).map(([k, v]) => (
                      <li key={k}>
                        {v} {k.replace(/([A-Z])/g, " $1").toLowerCase()}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2">Download a backup of your current data first if you might want it back.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => void restore()}>
              Replace and restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmWipe}
        onOpenChange={(o) => {
          setConfirmWipe(o)
          if (!o) setWipeText("")
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all LIFE OS data?</AlertDialogTitle>
            <AlertDialogDescription>Tasks, habits, history, focus sessions and settings in this browser will be erased. This can&apos;t be undone. Type DELETE to confirm.</AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={wipeText} onChange={(e) => setWipeText(e.target.value)} placeholder="DELETE" aria-label="Type DELETE to confirm" className="rounded-xl" />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={wipeText !== "DELETE" || busy} onClick={() => void wipe()}>
              Delete everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
