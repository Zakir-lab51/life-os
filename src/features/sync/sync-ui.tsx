"use client"

import { formatDistanceToNowStrict } from "date-fns"
import { resolveText, type DXCUserInteraction } from "dexie-cloud-addon"
import { useObservable } from "dexie-react-hooks"
import { Cloud, CloudOff, Laptop, Loader2, LogOut, RefreshCw, Smartphone } from "lucide-react"
import { useState, type FormEvent } from "react"
import { toast } from "sonner"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Field } from "@/components/os/field"
import { readSync, syncAvailable, type SyncStart } from "@/lib/db/cloud"
import { db, SYNCED } from "@/lib/db/db"
import { cn } from "@/lib/utils"
import { Group, IconTile, Row } from "@/features/settings/settings-ui"
import { LifeMark } from "@/features/shell/sidebar"
import { cancelSync, finishSetup, stopSync, turnOnSync } from "./sync"

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
const cancelled = (e: unknown) => e instanceof Error && (e.name === "AbortError" || /cancel/i.test(e.message))

/**
 * Dexie Cloud's sign-in prompts (your email, the code it emails you, the odd message),
 * drawn as a LIFE OS dialog rather than its own. Mounted only while sync is on.
 */
export function CloudLoginDialog() {
  const ui = useObservable(db.cloud.userInteraction)
  if (!ui) return null
  return <LoginPrompt key={`${ui.type}:${ui.title}`} ui={ui} />
}

function LoginPrompt({ ui }: { ui: DXCUserInteraction }) {
  const fields = Object.entries(ui.fields ?? {}) as [string, { type: string; label?: string; placeholder?: string }][]
  const [values, setValues] = useState<Record<string, string>>({})
  const submit = (e: FormEvent) => {
    e.preventDefault()
    ui.onSubmit(values)
  }
  const title = ui.type === "otp" ? "Enter the code" : ui.type === "email" ? "Sign in to sync" : ui.title
  return (
    <Dialog open onOpenChange={(open) => !open && ui.onCancel()}>
      <DialogContent className="rounded-dialog sm:max-w-sm">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {ui.type === "otp" && <DialogDescription>We emailed you a code. It may take a minute, and can land in spam.</DialogDescription>}
          </DialogHeader>
          {ui.alerts?.map((a, i) => (
            <p key={i} role={a.type === "error" ? "alert" : "status"} className={cn("rounded-xl px-3 py-2 text-sm", a.type === "error" ? "bg-destructive/10 text-destructive" : a.type === "warning" ? "bg-amber/10" : "bg-foreground/[0.05] text-muted-foreground")}>
              {resolveText(a)}
            </p>
          ))}
          {fields.map(([name, f], i) => (
            <Field key={name} label={f.label ?? (name === "otp" ? "Code" : name === "email" ? "Email" : name)} htmlFor={`cloud-${name}`}>
              <Input
                id={`cloud-${name}`}
                autoFocus={i === 0}
                type={name === "email" ? "email" : f.type === "password" ? "password" : "text"}
                inputMode={name === "otp" ? "numeric" : undefined}
                autoComplete={name === "otp" ? "one-time-code" : name === "email" ? "email" : undefined}
                placeholder={f.placeholder}
                value={values[name] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
                className="h-11 rounded-xl"
              />
            </Field>
          ))}
          <DialogFooter>
            {ui.cancelLabel && (
              <Button type="button" variant="ghost" onClick={() => ui.onCancel()}>
                {ui.cancelLabel}
              </Button>
            )}
            <Button type="submit">{ui.submitLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The first screen on a device that has just turned sync on: sign in, download what's in
 * your account, and (on the device you chose to start from) copy its data up. The app
 * starts only after that, so a fresh device never writes its defaults over your data.
 */
export function SyncGate({ onReady }: { onReady: () => void }) {
  const setting = readSync()
  const user = useObservable(db.cloud.currentUser)
  const [step, setStep] = useState<"signin" | "busy" | "downloading" | "conflict">("signin")
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const fromHere = setting?.start === "this-device"

  const finish = async (copyOwn: boolean | "ask") => {
    setStep("downloading")
    try {
      if ((await finishSetup(copyOwn)) === "account-has-data") setStep("conflict")
      else onReady()
    } catch (e) {
      setError(`Couldn't finish setting up sync: ${message(e)}`)
      setStep("signin")
    }
  }
  const signIn = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setStep("busy")
    try {
      await db.cloud.login({ email: email.trim(), grant_type: "otp" })
      await finish("ask")
    } catch (err) {
      if (!cancelled(err)) setError(message(err))
      setStep("signin")
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <div className="glass w-full max-w-md rounded-panel p-6 sm:p-8">
        <LifeMark className="size-10" />
        {step === "downloading" ? (
          <div className="mt-5" role="status">
            <h1 className="text-xl font-semibold">{fromHere ? "Setting up sync" : "Getting your data"}</h1>
            <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> {fromHere ? "Copying this device's data into your account…" : "Downloading from your account…"}
            </p>
          </div>
        ) : step === "conflict" ? (
          <div className="mt-5">
            <h1 className="text-xl font-semibold">Your account already has data</h1>
            <p className="mt-2 text-sm text-muted-foreground">It came from another device. Use it here, or add this device&apos;s data to it as well (you may then have two of some things). Either way, this device&apos;s own data stays where it is, untouched.</p>
            <div className="mt-6 grid gap-2">
              <Button onClick={() => void finish(false)}>Use my account&apos;s data</Button>
              <Button variant="ghost" onClick={() => void finish(true)}>
                Add this device&apos;s data too
              </Button>
            </div>
          </div>
        ) : user?.isLoggedIn ? (
          <div className="mt-5">
            <h1 className="text-xl font-semibold">Finish setting up sync</h1>
            <p className="mt-2 text-sm text-muted-foreground">You&apos;re signed in as {user.email}.</p>
            {error && (
              <p role="alert" className="mt-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <Button className="mt-6 w-full" onClick={() => void finish("ask")}>
              Continue
            </Button>
          </div>
        ) : (
          <form className="mt-5" onSubmit={(e) => void signIn(e)}>
            <h1 className="text-xl font-semibold">Sign in to sync</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {fromHere ? "We'll email you a code. After that, this device's data goes into your account, ready for your other devices." : "Use the same email as on your other device, and your data will download here."}
            </p>
            {error && (
              <p role="alert" className="mt-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <Field label="Email" htmlFor="sync-email" className="mt-5">
              <Input id="sync-email" type="email" autoComplete="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 rounded-xl" />
            </Field>
            <Button type="submit" className="mt-4 w-full" disabled={step === "busy" || !email.includes("@")}>
              {step === "busy" ? <Loader2 className="animate-spin" /> : null} Email me a code
            </Button>
            <Button type="button" variant="ghost" className="mt-2 w-full" onClick={cancelSync}>
              Not now: keep this device on its own
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}

type SyncStatus = "synced" | "syncing" | "offline" | "error" | "waiting"

/** How sync is doing on this device, and when it last finished. Only call while SYNCED. */
function useSyncStatus() {
  const state = useObservable(db.cloud.syncState)
  const persisted = useObservable(db.cloud.persistedSyncState)
  const status: SyncStatus =
    state?.phase === "in-sync"
      ? "synced"
      : state?.phase === "pushing" || state?.phase === "pulling"
        ? "syncing"
        : state?.phase === "offline" || state?.status === "offline"
          ? "offline"
          : state?.phase === "error"
            ? "error"
            : "waiting"
  return { status, last: persisted?.timestamp, error: state?.error }
}

const statusText = (status: SyncStatus, last?: Date) =>
  status === "synced" ? (last ? `Synced ${formatDistanceToNowStrict(last, { addSuffix: true })}` : "Synced") : status === "syncing" ? "Syncing…" : status === "offline" ? "Offline: syncs when you're back" : status === "error" ? "Couldn't sync" : "Waiting to sync"

/** A dot on your profile picture while sync is on: green up to date, violet syncing, grey offline or waiting, red on a problem. */
export function SyncDot() {
  return SYNCED ? <SyncDotOn /> : null
}

function SyncDotOn() {
  const { status, last } = useSyncStatus()
  return (
    <span
      role="img"
      aria-label={statusText(status, last)}
      className={cn("absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-background", status === "synced" ? "bg-mint" : status === "syncing" ? "animate-pulse bg-violet" : status === "error" ? "bg-destructive" : "bg-muted-foreground")}
    />
  )
}

/** The profile menu's line about sync; it opens the sync settings. */
export function SyncMenuStatus({ onOpen }: { onOpen: () => void }) {
  return SYNCED ? <SyncMenuStatusOn onOpen={onOpen} /> : null
}

function SyncMenuStatusOn({ onOpen }: { onOpen: () => void }) {
  const { status, last } = useSyncStatus()
  const Icon = status === "error" || status === "offline" ? CloudOff : Cloud
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs text-muted-foreground outline-none hover:bg-foreground/[0.06] focus-visible:ring-2 focus-visible:ring-ring">
      <Icon className="size-3.5 shrink-0" />
      {statusText(status, last)}
    </button>
  )
}

/** Settings → Data & backup: turn sync on, see how it's doing, or stop it on this device. */
export function SyncGroup() {
  if (!syncAvailable) return null
  return SYNCED ? <SyncOn /> : <SyncOff />
}

const FOOTER = "Sync goes through Dexie Cloud: your data is kept on its servers so all your devices can reach it. You sign in on each device with a code sent to your email; LIFE OS keeps working offline and catches up when you're back."

function SyncOff() {
  const [choosing, setChoosing] = useState(false)
  const [start, setStart] = useState<SyncStart>("this-device")
  const options: { value: SyncStart; icon: typeof Laptop; label: string; description: string }[] = [
    { value: "this-device", icon: Laptop, label: "This device has my data", description: "It goes into your account, ready for your other devices. Do this on one device." },
    { value: "account", icon: Smartphone, label: "Use the data in my account", description: "For your other devices, after the first. This device's own data stays here, untouched." },
  ]
  return (
    <Group id="s-sync" title="Sync" footer={FOOTER}>
      <Row icon={<IconTile icon={Cloud} color="#0a84ff" />} label="Sync across your devices" description="Off: each device keeps its own data" onClick={() => setChoosing(true)} />
      <Dialog open={choosing} onOpenChange={setChoosing}>
        <DialogContent className="rounded-dialog sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Turn on sync</DialogTitle>
            <DialogDescription>Where should this device start from?</DialogDescription>
          </DialogHeader>
          <div role="radiogroup" aria-label="Start from" className="grid gap-2">
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={start === o.value}
                onClick={() => setStart(o.value)}
                className={cn("flex items-start gap-3 rounded-2xl border p-3.5 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring", start === o.value ? "border-violet/60 bg-violet/10" : "border-line hover:bg-foreground/[0.04]")}
              >
                <o.icon className="mt-0.5 size-5 shrink-0 text-violet" />
                <span>
                  <span className="block text-sm font-medium">{o.label}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{o.description}</span>
                </span>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setChoosing(false)}>
              Cancel
            </Button>
            <Button onClick={() => turnOnSync(start)}>Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Group>
  )
}

function SyncOn() {
  const user = useObservable(db.cloud.currentUser)
  const sync = useSyncStatus()
  const [confirmStop, setConfirmStop] = useState(false)
  const [stopping, setStopping] = useState(false)
  const status = {
    synced: { label: "Up to date", tone: "bg-mint/20" },
    syncing: { label: "Syncing…", tone: "bg-blue/20" },
    offline: { label: "Offline", tone: "bg-foreground/10" },
    error: { label: "Couldn't sync", tone: "bg-destructive/15 text-destructive" },
    waiting: { label: "Waiting", tone: "bg-foreground/10" },
  }[sync.status]
  const last = sync.last ? `Last synced ${formatDistanceToNowStrict(sync.last, { addSuffix: true })}` : "Not synced yet"
  const stop = async () => {
    setStopping(true)
    try {
      await stopSync()
    } catch (e) {
      toast.error("Couldn't stop syncing", { description: message(e) })
      setStopping(false)
      setConfirmStop(false)
    }
  }
  return (
    <Group id="s-sync" title="Sync" footer={sync.status === "offline" ? "You're offline. Changes stay on this device and sync when you're back online." : FOOTER}>
      <Row
        icon={<IconTile icon={sync.status === "error" ? CloudOff : Cloud} color="#0a84ff" />}
        label={user?.email ? `Syncing as ${user.email}` : "Syncing"}
        description={sync.status === "error" && sync.error ? sync.error.message : last}
        control={<span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", status.tone)}>{status.label}</span>}
      />
      <Row icon={<IconTile icon={RefreshCw} color="#5e5ce6" />} label="Sync now" onClick={() => void db.cloud.sync().catch((e) => toast.error("Couldn't sync", { description: message(e) }))} />
      <Row icon={<IconTile icon={LogOut} color="#8e8e93" />} label="Stop syncing on this device" description="It keeps everything as it is now; your other devices keep syncing" tone="danger" onClick={() => setConfirmStop(true)} />
      <AlertDialog open={confirmStop} onOpenChange={setConfirmStop}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop syncing on this device?</AlertDialogTitle>
            <AlertDialogDescription>This device keeps a copy of everything as it is now and signs out. Your account and other devices aren&apos;t changed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={stopping}>Keep syncing</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={stopping} onClick={(e) => (e.preventDefault(), void stop())}>
              {stopping ? <Loader2 className="animate-spin" /> : null} Stop syncing
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Group>
  )
}
