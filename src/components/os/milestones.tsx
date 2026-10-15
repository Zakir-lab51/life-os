"use client"

import { Check, Plus, X } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DatePicker } from "@/components/os/date-picker"
import { formatDay, toISODate } from "@/lib/domain/dates"
import type { Milestone } from "@/lib/domain/types"
import { cn, uid } from "@/lib/utils"

/**
 * Milestones as a numbered track (a goal's sheet, a project's page): tap one to reach it or
 * take it back. With `onAdd`, a row underneath adds another; it resolves true once saved.
 */
export function MilestoneTrack({ milestones, today, onToggle, onAdd }: { milestones: Milestone[]; today: string; onToggle: (m: Milestone) => void; onAdd?: (title: string, due: string | null) => Promise<boolean> }) {
  const [title, setTitle] = useState("")
  const [due, setDue] = useState<string | null>(null)
  const add = async () => {
    const t = title.trim()
    if (!t || !onAdd) return
    if (await onAdd(t.slice(0, 120), due)) {
      setTitle("")
      setDue(null)
    }
  }
  return (
    <>
      <ol className="relative space-y-1">
        {milestones.map((m, i) => {
          const late = !m.doneAt && m.due && m.due < today
          return (
            <li key={m.id} className="relative flex items-center gap-3 rounded-xl px-1 py-1.5">
              {i < milestones.length - 1 && <span aria-hidden className={cn("absolute top-8 bottom-[-10px] left-[15px] w-0.5 rounded-full", m.doneAt ? "bg-mint/60" : "bg-line")} />}
              <button
                type="button"
                role="checkbox"
                aria-checked={!!m.doneAt}
                aria-label={`${m.doneAt ? "Reached" : "Reach"}: ${m.title}`}
                onClick={() => onToggle(m)}
                className={cn("pressable relative grid size-7 shrink-0 place-items-center rounded-full ring-1 transition-colors", m.doneAt ? "bg-mint text-white ring-mint" : "bg-surface-2 text-muted-foreground ring-line hover:ring-foreground/30")}
              >
                {m.doneAt ? <Check className="size-4" strokeWidth={3} /> : <span className="text-[11px] font-semibold">{i + 1}</span>}
              </button>
              <span className={cn("min-w-0 flex-1 truncate text-sm", m.doneAt && "text-muted-foreground")}>{m.title}</span>
              <span className={cn("shrink-0 text-xs", late ? "text-rose" : "text-muted-foreground")}>
                {m.doneAt ? `Reached ${formatDay(toISODate(new Date(m.doneAt)), "d MMM")}` : m.due ? `${late ? "Was due" : "Due"} ${formatDay(m.due, "d MMM")}` : ""}
              </span>
            </li>
          )
        })}
      </ol>
      {onAdd && (
        <form
          className="mt-2 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void add()
          }}
        >
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a milestone" aria-label="New milestone" maxLength={120} className="h-9 min-w-0 flex-1 rounded-xl" />
          <div className="w-36 shrink-0">
            <DatePicker value={due} placeholder="No date" onChange={setDue} />
          </div>
          <Button type="submit" size="icon-sm" variant="secondary" aria-label="Add milestone" disabled={!title.trim()}>
            <Plus />
          </Button>
        </form>
      )}
    </>
  )
}

/** Milestones in an editor (goals, projects): rename, date or remove each, and add more. */
export function MilestoneEditor({ value, onChange }: { value: Milestone[]; onChange: (next: Milestone[]) => void }) {
  const [draft, setDraft] = useState({ title: "", due: null as string | null })
  const add = () => {
    const title = draft.title.trim()
    if (!title) return
    onChange([...value, { id: uid("ms_"), title: title.slice(0, 120), due: draft.due, doneAt: null }])
    setDraft({ title: "", due: null })
  }
  return (
    <div className="space-y-1.5">
      {value.map((m, i) => (
        <div key={m.id} className="flex items-center gap-2">
          <span className={cn("grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold", m.doneAt ? "bg-mint text-white" : "bg-surface-3 text-muted-foreground")}>{m.doneAt ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}</span>
          <Input value={m.title} onChange={(e) => onChange(value.map((x) => (x.id === m.id ? { ...x, title: e.target.value } : x)))} aria-label={`Milestone ${i + 1}`} maxLength={120} className="h-9 flex-1 rounded-xl" />
          <div className="w-36 shrink-0">
            <DatePicker value={m.due} placeholder="No date" onChange={(v) => onChange(value.map((x) => (x.id === m.id ? { ...x, due: v } : x)))} />
          </div>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${m.title}`} onClick={() => onChange(value.filter((x) => x.id !== m.id))}>
            <X />
          </Button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <span className="grid size-6 shrink-0 place-items-center text-violet">
          <Plus className="size-4" />
        </span>
        <Input
          value={draft.title}
          onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return
            e.preventDefault()
            add()
          }}
          placeholder="Add a milestone"
          aria-label="New milestone"
          maxLength={120}
          className="h-9 flex-1 rounded-xl"
        />
        <div className="w-36 shrink-0">
          <DatePicker value={draft.due} placeholder="No date" onChange={(v) => setDraft((p) => ({ ...p, due: v }))} />
        </div>
        <Button type="button" variant="secondary" size="icon-sm" aria-label="Add milestone" onClick={add} disabled={!draft.title.trim()}>
          <Plus />
        </Button>
      </div>
    </div>
  )
}
