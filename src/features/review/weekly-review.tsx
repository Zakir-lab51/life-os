"use client"

import { useLiveQuery } from "dexie-react-hooks"
import { CalendarArrowUp, CheckCircle2, Flame, Target, Timer } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { DiscardBar, useCloseGuard, useUnsaved, type CloseGuard } from "@/components/os/editor-guard"
import { Field } from "@/components/os/field"
import { StatTile } from "@/components/os/visuals"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { db } from "@/lib/db/db"
import { moveTasksToDate, saveWeeklyReview } from "@/lib/db/repo"
import { addDays, formatDay, formatDuration } from "@/lib/domain/dates"
import { reviewWeek, weekSummary } from "@/lib/domain/review"
import type { ISODate, WeeklyReview } from "@/lib/domain/types"
import { attempt, succeeded } from "@/lib/feedback"
import { useUI } from "@/lib/stores/ui"
import { useLife, type Life } from "@/features/shell/use-life"

/**
 * The weekly review: how the week went (finished, slipped, focus, habits, goals), what went
 * well and what to change, and next week's top three, which become priority-1 tasks.
 */
export function WeeklyReviewDialog() {
  const open = useUI((s) => s.reviewOpen)
  const setOpen = useUI((s) => s.setReviewOpen)
  const guard = useCloseGuard(() => setOpen(false))
  const life = useLife()
  const week = life ? reviewWeek(life.today, life.prefs.weekStartsOn) : null
  const existing = useLiveQuery(async () => (week ? ((await db.reviews.get(week.start)) ?? null) : undefined), [week?.start])
  return (
    <Dialog open={open} onOpenChange={(o) => !o && guard.requestClose()}>
      <DialogContent className="max-h-[92dvh] gap-0 overflow-hidden rounded-dialog p-0 sm:max-w-lg">
        {open && life && week && existing !== undefined && <ReviewForm key={week.start} life={life} start={week.start} end={week.end} existing={existing} onDone={guard.close} guard={guard} />}
      </DialogContent>
    </Dialog>
  )
}

function ReviewForm({ life, start, end, existing, onDone, guard }: { life: Life; start: ISODate; end: ISODate; existing: WeeklyReview | null; onDone: () => void; guard: CloseGuard }) {
  const summary = useMemo(() => weekSummary(life.data, start, end, life.today), [life.data, start, end, life.today])
  const [wins, setWins] = useState(existing?.wins ?? "")
  const [improve, setImprove] = useState(existing?.improve ?? "")
  const [top, setTop] = useState(["", "", ""])
  const [busy, setBusy] = useState(false)
  useUnsaved(guard, { wins, improve, top })
  const nextWeek = addDays(start, 7)
  const topTasks = existing ? life.data.tasks.filter((t) => existing.topTaskIds.includes(t.id)) : []

  const moveSlipped = async () => {
    const ids = summary.slipped.map((t) => t.id)
    if (await succeeded(() => moveTasksToDate(ids, nextWeek))) toast.success(`Moved ${ids.length} to ${formatDay(nextWeek, "EEE d MMM")}`)
  }
  const save = async () => {
    setBusy(true)
    const review = await attempt(() => saveWeeklyReview({ weekStart: start, wins, improve, top }))
    setBusy(false)
    if (!review) return
    const made = existing ? 0 : review.topTaskIds.length
    toast.success("Week reviewed", { description: made ? `${made} top task${made === 1 ? "" : "s"} added for next week` : undefined })
    onDone()
  }

  return (
    <form
      className="relative flex max-h-[92dvh] flex-col"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <DialogHeader className="border-b border-line px-6 pt-6 pb-4">
        <DialogTitle>Weekly review</DialogTitle>
        <DialogDescription>
          {formatDay(start, "d MMM")} – {formatDay(end, "d MMM")}
          {existing ? " · reviewed" : ""}
        </DialogDescription>
      </DialogHeader>
      <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
        <div className="grid grid-cols-2 gap-2">
          <StatTile icon={CheckCircle2} tone="mint" label="Finished" value={summary.completed.length} sub={summary.completed.length === 1 ? "task" : "tasks"} />
          <StatTile icon={Timer} tone="violet" label="Focus" value={formatDuration(summary.focusMin)} />
          <StatTile icon={Flame} tone="amber" label="Habits" value={summary.habitRate === null ? "–" : `${Math.round(summary.habitRate * 100)}%`} sub="of check-ins kept" />
          <StatTile icon={Target} tone="cyan" label="Goals" value={summary.goalSteps} sub="steps forward" />
        </div>

        {summary.completed.length > 0 && (
          <section>
            <h3 className="mb-1.5 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Finished</h3>
            <ul className="space-y-1 text-sm">
              {summary.completed.slice(0, 5).map((t) => (
                <li key={t.id} className="truncate">
                  {t.title}
                </li>
              ))}
              {summary.completed.length > 5 && <li className="text-xs text-muted-foreground">and {summary.completed.length - 5} more</li>}
            </ul>
          </section>
        )}

        {summary.slipped.length > 0 && (
          <section>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Slipped</h3>
              <Button type="button" size="xs" variant="ghost" onClick={() => void moveSlipped()}>
                <CalendarArrowUp /> Move to next week
              </Button>
            </div>
            <ul className="space-y-1 text-sm">
              {summary.slipped.slice(0, 6).map((t) => (
                <li key={t.id} className="truncate">
                  {t.title}
                </li>
              ))}
              {summary.slipped.length > 6 && <li className="text-xs text-muted-foreground">and {summary.slipped.length - 6} more</li>}
            </ul>
          </section>
        )}

        <Field label="What went well" htmlFor="review-wins">
          <Textarea id="review-wins" value={wins} onChange={(e) => setWins(e.target.value)} className="min-h-20 rounded-xl" maxLength={4000} />
        </Field>
        <Field label="What to change" htmlFor="review-improve">
          <Textarea id="review-improve" value={improve} onChange={(e) => setImprove(e.target.value)} className="min-h-20 rounded-xl" maxLength={4000} />
        </Field>

        {existing ? (
          topTasks.length > 0 && (
            <section>
              <h3 className="mb-1.5 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Next week&apos;s top three</h3>
              <ul className="space-y-1 text-sm">
                {topTasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-2">
                    <CheckCircle2 className={t.status === "done" ? "size-4 text-mint" : "size-4 text-muted-foreground/50"} aria-label={t.status === "done" ? "Done" : "Open"} />
                    <span className={t.status === "done" ? "text-muted-foreground line-through" : ""}>{t.title}</span>
                  </li>
                ))}
              </ul>
            </section>
          )
        ) : (
          <Field label="Next week's top three" hint={`They become priority-1 tasks, due by ${formatDay(addDays(nextWeek, 6), "EEE d MMM")}.`}>
            <div className="space-y-2">
              {top.map((v, i) => (
                <Input key={i} value={v} onChange={(e) => setTop((t) => t.map((x, j) => (j === i ? e.target.value : x)))} placeholder={["The one that matters most", "Then", "And"][i]} aria-label={`Top task ${i + 1}`} maxLength={200} className="h-10 rounded-xl" />
              ))}
            </div>
          </Field>
        )}
      </div>
      <DialogFooter className="flex-row items-center justify-end gap-2 border-t border-line bg-surface-2/40 px-6 py-4">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {existing ? "Save" : "Finish review"}
        </Button>
      </DialogFooter>
      <DiscardBar guard={guard} />
    </form>
  )
}
