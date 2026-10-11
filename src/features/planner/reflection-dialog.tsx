"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Field } from "@/components/os/field"
import { useReflection, useToday } from "@/lib/db/hooks"
import { saveReflection } from "@/lib/db/repo"
import { formatDay } from "@/lib/domain/dates"
import type { Reflection } from "@/lib/domain/types"
import { attempt } from "@/lib/feedback"
import { useUI } from "@/lib/stores/ui"
import { cn } from "@/lib/utils"

export const MOODS: { value: Reflection["mood"]; label: string; hue: string }[] = [
  { value: 1, label: "Rough", hue: "bg-rose" },
  { value: 2, label: "Meh", hue: "bg-amber" },
  { value: 3, label: "Okay", hue: "bg-lilac" },
  { value: 4, label: "Good", hue: "bg-cyan" },
  { value: 5, label: "Great", hue: "bg-mint" },
]

export function ReflectionDialog() {
  const open = useUI((s) => s.reflectionOpen)
  const setOpen = useUI((s) => s.setReflectionOpen)
  const plannerDate = useUI((s) => s.plannerDate)
  const today = useToday()
  const date = plannerDate && plannerDate <= today ? plannerDate : today
  const existing = useReflection(date)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="rounded-dialog p-0 sm:max-w-lg">
        {open && existing !== undefined && <ReflectionForm key={date} date={date} today={today} existing={existing} onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  )
}

export function ReflectionForm({ date, today, existing, onDone }: { date: string; today: string; existing: Reflection | null; onDone?: () => void }) {
  const [mood, setMood] = useState<Reflection["mood"] | null>(existing?.mood ?? null)
  const [wins, setWins] = useState(existing?.wins ?? "")
  const [improve, setImprove] = useState(existing?.improve ?? "")

  const save = async () => {
    if (!mood) {
      toast.error("Pick how the day felt first")
      return
    }
    const saved = await attempt(() => saveReflection(date, { mood, wins, improve }))
    if (!saved) return
    toast.success(existing ? "Reflection updated" : "Reflection saved", { description: "+10 XP for showing up for yourself." })
    onDone?.()
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <DialogHeader className="border-b border-line px-6 pt-6 pb-4">
        <DialogTitle>{date === today ? "Today's reflection" : `Reflection · ${formatDay(date)}`}</DialogTitle>
        <DialogDescription>Two minutes to close the loop on the day.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 px-6 py-5">
        <Field label="How did the day feel?">
          <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Mood">
            {MOODS.map((m) => (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={mood === m.value}
                onClick={() => setMood(m.value)}
                className={cn("flex flex-col items-center gap-1.5 rounded-2xl border py-2.5 text-xs transition-colors", mood === m.value ? "border-foreground/40 bg-surface-3" : "border-line text-muted-foreground hover:text-foreground")}
              >
                <span className={cn("size-3 rounded-full", m.hue, mood !== m.value && "opacity-50")} />
                {m.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="What went well?" htmlFor="ref-wins">
          <Textarea id="ref-wins" value={wins} onChange={(e) => setWins(e.target.value)} placeholder="A win, however small" className="min-h-20 rounded-xl" maxLength={2000} />
        </Field>
        <Field label="What would you do differently?" htmlFor="ref-improve">
          <Textarea id="ref-improve" value={improve} onChange={(e) => setImprove(e.target.value)} placeholder="One adjustment for tomorrow" className="min-h-20 rounded-xl" maxLength={2000} />
        </Field>
      </div>
      <DialogFooter className="border-t border-line bg-surface-2/40 px-6 py-4">
        {onDone && (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
        <Button type="submit">{existing ? "Update" : "Save reflection"}</Button>
      </DialogFooter>
    </form>
  )
}
