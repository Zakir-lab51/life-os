"use client"

import { Flag, Plus, Sparkles, Target, TrendingUp, Trophy } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Segmented } from "@/components/os/field"
import { PageHeader, PageTransition } from "@/components/os/page-header"
import { Panel } from "@/components/os/panel"
import { EmptyState, StatTile } from "@/components/os/visuals"
import { createGoal } from "@/lib/db/repo"
import { GOAL_HORIZONS, type Goal, type GoalHorizon, type GoalStatus } from "@/lib/domain/types"
import { HORIZON_META, defaultDueDate, horizonRank } from "@/lib/domain/goals"
import { attempt } from "@/lib/feedback"
import { useUI } from "@/lib/stores/ui"
import { cn } from "@/lib/utils"
import { warmDialog } from "@/features/shell/lazy-dialogs"
import { useLife, type Life } from "@/features/shell/use-life"
import { GoalCard } from "./goal-card"
import { Roadmap } from "./roadmap"
import { useGoalEvaluations } from "./shared"

type View = "goals" | "roadmap"

export function GoalsView() {
  // a goal opens from here: fetch its dialog (and the charts in it) ahead of the first tap
  useEffect(() => warmDialog("goal"), [])
  const life = useLife()
  if (!life) {
    return (
      <div className="grid gap-4 @3xl/main:grid-cols-2 @6xl/main:grid-cols-3" aria-busy="true">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-64 rounded-panel" />
        ))}
      </div>
    )
  }
  return <Goals life={life} />
}

const byDeadline = (a: Goal, b: Goal) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || horizonRank(b.horizon) - horizonRank(a.horizon)

function Goals({ life }: { life: Life }) {
  const { data, today } = life
  const openGoalEditor = useUI((s) => s.openGoalEditor)
  const evaluations = useGoalEvaluations(life)
  const [view, setView] = useState<View>("goals")
  const [horizon, setHorizon] = useState<GoalHorizon | "all">("all")
  const [status, setStatus] = useState<GoalStatus>("active")

  const goals = data.goals
  const active = goals.filter((g) => g.status === "active")
  const onTrack = active.filter((g) => ["ahead", "on-track", "ready"].includes(evaluations.get(g.id)?.forecast.outlook ?? "")).length
  const judged = active.filter((g) => !["no-deadline", "not-started"].includes(evaluations.get(g.id)?.forecast.outlook ?? "")).length
  const milestones = goals.filter((g) => g.status !== "archived").flatMap((g) => g.milestones)
  const year = today.slice(0, 4)
  const achieved = goals.filter((g) => g.status === "done")

  const inStatus = goals.filter((g) => g.status === status)
  const shown = inStatus
    .filter((g) => horizon === "all" || g.horizon === horizon)
    .sort(status === "done" ? (a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "") : byDeadline)

  return (
    <PageTransition>
      <PageHeader
        title="Goals"
        description="Where you're headed, from this week to five years out, and the everyday steps that get you there."
        actions={
          <>
            <Segmented<View>
              ariaLabel="Goals view"
              value={view}
              onChange={setView}
              options={[
                { value: "goals", label: "Goals" },
                { value: "roadmap", label: "Roadmap" },
              ]}
            />
            <Button onClick={() => openGoalEditor(null)}>
              <Plus /> New goal
            </Button>
          </>
        }
      />

      {goals.length === 0 ? (
        <FirstGoal life={life} />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 @4xl/main:grid-cols-4">
            <StatTile label="Active" value={active.length} sub={`${active.filter((g) => horizonRank(g.horizon) >= horizonRank("year")).length} long-term`} icon={Target} tone="violet" />
            <StatTile label="On track" value={judged ? `${onTrack}/${judged}` : "–"} sub={judged ? "with a deadline in sight" : "add deadlines to forecast"} icon={TrendingUp} tone="mint" />
            <StatTile label="Milestones" value={`${milestones.filter((m) => m.doneAt).length}/${milestones.length}`} sub="ticked off" icon={Flag} tone="cyan" />
            <StatTile label="Achieved" value={achieved.length} sub={`${achieved.filter((g) => g.completedAt?.startsWith(year)).length} this year`} icon={Trophy} tone="amber" />
          </div>

          {view === "roadmap" ? (
            <Roadmap life={life} evaluations={evaluations} />
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div role="group" aria-label="Filter by horizon" className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
                  {(["all", ...[...GOAL_HORIZONS].reverse()] as const).map((h) => {
                    const count = h === "all" ? inStatus.length : inStatus.filter((g) => g.horizon === h).length
                    if (h !== "all" && !count) return null
                    return (
                      <button
                        key={h}
                        type="button"
                        aria-pressed={horizon === h}
                        onClick={() => setHorizon(h)}
                        className={cn("pressable shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition-colors", horizon === h ? "bg-foreground text-background ring-transparent" : "text-muted-backdrop ring-line on-backdrop hover:text-foreground")}
                      >
                        {h === "all" ? "All" : HORIZON_META[h].adjective}
                        <span className="ml-1.5 opacity-75 tabular">{count}</span>
                      </button>
                    )
                  })}
                </div>
                <Segmented<GoalStatus>
                  ariaLabel="Goal status"
                  value={status}
                  onChange={(s) => {
                    setStatus(s)
                    setHorizon("all")
                  }}
                  options={[
                    { value: "active", label: "Active" },
                    { value: "done", label: "Achieved" },
                    { value: "archived", label: "Archived" },
                  ]}
                />
              </div>

              {shown.length ? (
                <div className="grid gap-4 @3xl/main:grid-cols-2 @6xl/main:grid-cols-3">
                  {shown.map((g) => {
                    const e = evaluations.get(g.id)
                    return e ? <GoalCard key={g.id} goal={g} evaluation={e} goals={goals} tasks={data.tasks} today={today} /> : null
                  })}
                </div>
              ) : (
                <Panel>
                  <EmptyState
                    compact
                    icon={status === "done" ? Trophy : Target}
                    title={status === "active" ? "No active goals" : status === "done" ? "Nothing achieved yet" : "Nothing archived"}
                    body={status === "done" ? "Goals you mark as achieved collect here." : status === "archived" ? "Goals you set aside stay here, with their history." : "Pick something you want to be true by the end of this month."}
                    action={
                      status === "active" ? (
                        <Button size="sm" onClick={() => openGoalEditor(null)}>
                          <Plus /> New goal
                        </Button>
                      ) : undefined
                    }
                  />
                </Panel>
              )}
            </>
          )}
        </>
      )}
    </PageTransition>
  )
}

/** Empty page: start from scratch, or turn the life goals from setup into yearly goals. */
function FirstGoal({ life }: { life: Life }) {
  const openGoalEditor = useUI((s) => s.openGoalEditor)
  const ideas = life.prefs.lifeGoals
  const [busy, setBusy] = useState(false)

  async function importIdeas() {
    setBusy(true)
    const due = defaultDueDate("year", life.today, life.prefs.weekStartsOn)
    let made = 0
    for (const title of ideas) {
      const ok = await attempt(() => createGoal({ title, horizon: "year", area: "personal", startDate: life.today, dueDate: due }))
      if (ok) made++
    }
    setBusy(false)
    if (made) toast.success(`${made} yearly goal${made === 1 ? "" : "s"} added`, { description: "Open one to add milestones, tasks or habits." })
  }

  return (
    <div className="grid gap-4 @4xl/main:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <Panel>
        <EmptyState
          icon={Target}
          title="Set your first goal"
          body="Give it a horizon and a way to measure it: milestones, linked tasks, a number to reach, or a habit to keep. Then tasks and habits move it forward on their own."
          action={
            <Button onClick={() => openGoalEditor(null)}>
              <Plus /> Create a goal
            </Button>
          }
        />
      </Panel>
      {ideas.length > 0 && (
        <Panel>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="size-4 text-violet" /> From your setup
          </div>
          <p className="mt-1 text-sm text-muted-foreground">You named these when you set up LIFE OS. Turn them into yearly goals and refine each one later.</p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {ideas.map((t) => (
              <li key={t} className="rounded-full bg-surface-2/80 px-3 py-1 text-xs font-medium ring-1 ring-line">
                {t}
              </li>
            ))}
          </ul>
          <Button className="mt-5" variant="secondary" disabled={busy} onClick={() => void importIdeas()}>
            <Plus /> Add {ideas.length === 1 ? "it" : `all ${ideas.length}`} as yearly goals
          </Button>
        </Panel>
      )}
    </div>
  )
}
