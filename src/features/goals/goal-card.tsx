"use client"

import { CornerLeftUp, Flag, ListChecks, Repeat } from "lucide-react"
import { Panel } from "@/components/os/panel"
import { RingGauge } from "@/components/os/visuals"
import { formatDay } from "@/lib/domain/dates"
import { linkedTasks, type GoalEvaluation } from "@/lib/domain/goals"
import type { Goal, Task } from "@/lib/domain/types"
import { useUI } from "@/lib/stores/ui"
import { cn } from "@/lib/utils"
import { AreaDot, HorizonChip, OutlookBadge, Sparkline, dueText } from "./shared"

export function GoalCard({ goal, evaluation, goals, tasks, today }: { goal: Goal; evaluation: GoalEvaluation; goals: Goal[]; tasks: Task[]; today: string }) {
  const showGoal = useUI((s) => s.showGoal)
  const { progress, history, forecast } = evaluation
  const parent = goal.parentId ? goals.find((g) => g.id === goal.parentId) : undefined
  const children = goals.filter((g) => g.parentId === goal.id && g.status !== "archived").length
  const nextMilestone = goal.milestones.filter((m) => !m.doneAt).sort((a, b) => (a.due ?? "9999") < (b.due ?? "9999") ? -1 : 1)[0]
  const taskCount = linkedTasks(goal, tasks).length
  const pct = Math.round(progress.ratio * 100)

  return (
    <Panel as="article" className={cn("p-0 sm:p-0", goal.status === "archived" && "opacity-70")}>
      <button type="button" onClick={() => showGoal(goal.id)} className="pressable flex h-full w-full flex-col gap-4 p-5 text-left outline-none [--press-scale:0.985] focus-visible:ring-2 focus-visible:ring-ring sm:p-6">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <HorizonChip horizon={goal.horizon} />
            <AreaDot goal={goal} />
          </div>
          <OutlookBadge forecast={forecast} />
        </div>

        <div className="flex items-center gap-4">
          <RingGauge value={pct} size={64} stroke={6} tone={goal.status === "done" ? "mint" : "violet"} label={`${pct}% · ${progress.label}`}>
            <span className="text-sm font-semibold tabular">{pct}%</span>
          </RingGauge>
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-[1.05rem] leading-snug font-semibold tracking-tight">{goal.title}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {progress.label} · {dueText(goal, today)}
            </p>
          </div>
        </div>

        <Sparkline goal={goal} history={history} today={today} />

        <div className="mt-auto space-y-2 text-xs text-muted-foreground">
          {nextMilestone && goal.status === "active" && (
            <p className="flex items-center gap-1.5 truncate">
              <Flag className="size-3.5 shrink-0 text-violet" />
              <span className="truncate">
                Next: {nextMilestone.title}
                {nextMilestone.due && ` · ${formatDay(nextMilestone.due, "d MMM")}`}
              </span>
            </p>
          )}
          {parent && (
            <p className="flex items-center gap-1.5 truncate">
              <CornerLeftUp className="size-3.5 shrink-0" />
              <span className="truncate">Serves: {parent.title}</span>
            </p>
          )}
          {(taskCount > 0 || goal.habitIds.length > 0 || children > 0) && (
            <p className="flex flex-wrap gap-x-3 gap-y-1">
              {taskCount > 0 && (
                <span className="inline-flex items-center gap-1">
                  <ListChecks className="size-3.5" /> {taskCount} task{taskCount === 1 ? "" : "s"}
                </span>
              )}
              {goal.habitIds.length > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Repeat className="size-3.5" /> {goal.habitIds.length} habit{goal.habitIds.length === 1 ? "" : "s"}
                </span>
              )}
              {children > 0 && <span>{children} smaller goal{children === 1 ? "" : "s"}</span>}
            </p>
          )}
        </div>
      </button>
    </Panel>
  )
}
