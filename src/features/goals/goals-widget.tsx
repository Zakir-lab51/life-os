"use client"

import { ArrowUpRight, Plus, Target } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Panel } from "@/components/os/panel"
import { EmptyState, HatchBar } from "@/components/os/visuals"
import { horizonRank } from "@/lib/domain/goals"
import { useUI } from "@/lib/stores/ui"
import type { Life } from "@/features/shell/use-life"
import { HorizonChip, OutlookBadge, dueText, useGoalEvaluations } from "./shared"

/** Overview card: the active goals closest to their deadline, with progress and outlook. */
export function GoalsWidget({ life }: { life: Life }) {
  const evaluations = useGoalEvaluations(life)
  const showGoal = useUI((s) => s.showGoal)
  const openGoalEditor = useUI((s) => s.openGoalEditor)
  const active = life.data.goals
    .filter((g) => g.status === "active")
    .sort((a, b) => (a.dueDate ?? "9999") < (b.dueDate ?? "9999") ? -1 : (a.dueDate ?? "9999") > (b.dueDate ?? "9999") ? 1 : horizonRank(a.horizon) - horizonRank(b.horizon))
    .slice(0, 4)

  return (
    <Panel>
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-[1.05rem] font-semibold tracking-tight">Goals</h2>
          <p className="text-xs text-muted-foreground">Closest deadlines first</p>
        </div>
        <Button asChild variant="ghost" size="icon-sm" aria-label="All goals">
          <Link href="/goals">
            <ArrowUpRight />
          </Link>
        </Button>
      </div>
      {active.length ? (
        <ul className="space-y-3">
          {active.map((g) => {
            const e = evaluations.get(g.id)
            if (!e) return null
            return (
              <li key={g.id}>
                <button type="button" onClick={() => showGoal(g.id)} title={`${g.title} · ${e.progress.label}`} className="pressable w-full rounded-2xl p-2 text-left transition-colors [--press-scale:0.985] hover:bg-foreground/[0.04]">
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium">{g.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular">{Math.round(e.progress.ratio * 100)}%</span>
                  </div>
                  <HatchBar value={e.progress.ratio} tone="violet" height={8} />
                  <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <HorizonChip horizon={g.horizon} className="px-1.5 py-0 text-[9px]" />
                    <OutlookBadge forecast={e.forecast} className="px-1.5 py-0 text-[10px]" />
                    <span className="ml-auto truncate">{dueText(g, life.today)}</span>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <EmptyState
          compact
          icon={Target}
          title="No goals yet"
          body="Set one goal and watch everyday tasks and habits move it forward."
          action={
            <Button size="sm" onClick={() => openGoalEditor(null)}>
              <Plus /> New goal
            </Button>
          }
        />
      )}
    </Panel>
  )
}
