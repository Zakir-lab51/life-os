"use client"

import { ArrowRight, CalendarDays, Flag, Target } from "lucide-react"
import { useRouter } from "next/navigation"
import { Panel } from "@/components/os/panel"
import { HatchBar } from "@/components/os/visuals"
import { formatDay, relativeDayLabel } from "@/lib/domain/dates"
import { projectDueText, type ProjectEvaluation } from "@/lib/domain/projects"
import type { Goal, Project } from "@/lib/domain/types"
import { cn } from "@/lib/utils"
import { openProject } from "./route"
import { HealthBadge, ProjectGlyph } from "./shared"

export function ProjectCard({ project, evaluation, goals, today }: { project: Project; evaluation: ProjectEvaluation; goals: Goal[]; today: string }) {
  const router = useRouter()
  const { progress, health, next } = evaluation
  const pct = Math.round(progress.ratio * 100)
  const goal = project.goalId ? goals.find((g) => g.id === project.goalId) : undefined
  const milestone = project.milestones.filter((m) => !m.doneAt).sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"))[0]
  const active = project.status === "active" || project.status === "paused"

  return (
    <Panel as="article" className="p-0 sm:p-0">
      <button
        type="button"
        onClick={() => openProject(project.id, router.push)}
        className="pressable flex h-full w-full flex-col gap-4 p-5 text-left outline-none [--press-scale:0.985] focus-visible:ring-2 focus-visible:ring-ring sm:p-6"
      >
        <div className="flex items-start gap-3">
          <ProjectGlyph project={project} />
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-[1.05rem] leading-snug font-semibold tracking-tight">{project.name}</h3>
            {project.description && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{project.description}</p>}
          </div>
          <HealthBadge health={health} />
        </div>

        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
            <span>{progress.label}</span>
            <span className="font-semibold text-foreground tabular">{pct}%</span>
          </div>
          <HatchBar value={progress.ratio} tone={project.color} height={8} />
        </div>

        <div className="mt-auto space-y-2 text-xs text-muted-foreground">
          {active && next && (
            <p className="flex items-center gap-1.5">
              <ArrowRight className="size-3.5 shrink-0 text-foreground/70" />
              <span className="truncate">
                Next: <span className="text-foreground/85">{next.title}</span>
                {next.dueDate && ` · ${relativeDayLabel(next.dueDate, today)}`}
              </span>
            </p>
          )}
          {active && milestone && (
            <p className="flex items-center gap-1.5">
              <Flag className="size-3.5 shrink-0 text-violet" />
              <span className="truncate">
                {milestone.title}
                {milestone.due && ` · ${formatDay(milestone.due, "d MMM")}`}
              </span>
            </p>
          )}
          <p className="flex flex-wrap gap-x-3 gap-y-1">
            <span className={cn("inline-flex items-center gap-1", health === "overdue" && "text-rose")}>
              <CalendarDays className="size-3.5" /> {projectDueText(project, today)}
            </span>
            {goal && (
              <span className="inline-flex min-w-0 items-center gap-1">
                <Target className="size-3.5 shrink-0" /> <span className="truncate">{goal.title}</span>
              </span>
            )}
          </p>
        </div>
      </button>
    </Panel>
  )
}
