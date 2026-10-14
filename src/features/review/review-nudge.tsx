"use client"

import { useLiveQuery } from "dexie-react-hooks"
import { ClipboardCheck, X } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { db } from "@/lib/db/db"
import { daysBetween, formatDay, startOfWeek } from "@/lib/domain/dates"
import { reviewWeek } from "@/lib/domain/review"
import type { ISODate } from "@/lib/domain/types"
import { useUI } from "@/lib/stores/ui"

const dismissedKey = (week: ISODate) => `life-os.review-dismissed.${week}`

/**
 * On the Overview, around the turn of the week (its last day and the next two), until that
 * week is reviewed: a gentle card that opens the weekly review. It can be put away for the week.
 */
export function ReviewNudge({ today, weekStartsOn }: { today: ISODate; weekStartsOn: 0 | 1 }) {
  const setReviewOpen = useUI((s) => s.setReviewOpen)
  const week = reviewWeek(today, weekStartsOn)
  const into = daysBetween(startOfWeek(today, weekStartsOn), today)
  const due = into <= 1 || into === 6
  const done = useLiveQuery(async () => !!(await db.reviews.get(week.start)), [week.start])
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(dismissedKey(week.start)) === "1"
    } catch {
      return false
    }
  })
  if (!due || done !== false || dismissed) return null
  const dismiss = () => {
    try {
      localStorage.setItem(dismissedKey(week.start), "1")
    } catch {
      // storage blocked: hidden until the page reloads
    }
    setDismissed(true)
  }
  return (
    <div className="glass mb-4 flex flex-wrap items-center gap-3 rounded-panel p-4" role="status">
      <ClipboardCheck className="size-5 shrink-0 text-violet" aria-hidden />
      <div className="min-w-[12rem] flex-1">
        <p className="font-medium">Your weekly review is ready</p>
        <p className="text-xs text-muted-foreground">
          How did {formatDay(week.start, "d MMM")} – {formatDay(week.end, "d MMM")} go? It takes a couple of minutes.
        </p>
      </div>
      <Button size="sm" onClick={() => setReviewOpen(true)}>
        Review the week
      </Button>
      <Button size="icon-sm" variant="ghost" aria-label="Not this week" onClick={dismiss}>
        <X />
      </Button>
    </div>
  )
}
