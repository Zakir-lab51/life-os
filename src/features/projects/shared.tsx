"use client"

import { createContext, useContext, useMemo } from "react"
import { Icon } from "@/components/os/icon"
import { useLifeData } from "@/lib/db/hooks"
import { ACCENT_CLASSES } from "@/lib/domain/areas"
import { HEALTH_META, evaluateProjects, type ProjectEvaluation, type ProjectHealth } from "@/lib/domain/projects"
import type { Project } from "@/lib/domain/types"
import { cn } from "@/lib/utils"
import type { Life } from "@/features/shell/use-life"

/** Progress, health and next task for every project, recomputed whenever the records change. */
export function useProjectEvaluations(life: Life | undefined) {
  return useMemo(() => (life ? evaluateProjects(life.data.projects, life.data.tasks, life.today) : new Map<string, ProjectEvaluation>()), [life])
}

const TONE: Record<string, string> = {
  mint: "bg-mint/18 text-foreground ring-mint/35",
  violet: "bg-violet/15 text-foreground ring-violet/30",
  amber: "bg-amber/20 text-foreground ring-amber/40",
  rose: "bg-rose/18 text-foreground ring-rose/35",
  muted: "bg-surface-3/80 text-muted-foreground ring-line",
}
const DOT: Record<string, string> = { mint: "bg-mint", violet: "bg-violet", amber: "bg-amber", rose: "bg-rose", muted: "bg-muted-foreground/50" }

export function HealthBadge({ health, className }: { health: ProjectHealth; className?: string }) {
  const meta = HEALTH_META[health]
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1", TONE[meta.tone], className)}>
      <span className={cn("size-1.5 rounded-full", DOT[meta.tone])} />
      {meta.label}
    </span>
  )
}

/** The project's icon on a tile in its colour. */
export function ProjectGlyph({ project, size = "md", className }: { project: Pick<Project, "icon" | "color">; size?: "sm" | "md" | "lg"; className?: string }) {
  const accent = ACCENT_CLASSES[project.color]
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center ring-1 ring-inset",
        accent.soft,
        accent.text,
        accent.ring,
        size === "sm" && "size-6 rounded-lg [&_svg]:size-3.5",
        size === "md" && "size-11 rounded-2xl [&_svg]:size-5",
        size === "lg" && "size-14 rounded-[1.1rem] [&_svg]:size-6",
        className,
      )}
    >
      <Icon name={project.icon} strokeWidth={2.2} />
    </span>
  )
}

/** Inside a project's page its own tasks don't need to say which project they're in. */
const CurrentProject = createContext<string | null>(null)
export const CurrentProjectProvider = CurrentProject.Provider

/** A task's project, shown with its other details in task lists and on the board. */
export function ProjectChip({ projectId }: { projectId: string }) {
  const current = useContext(CurrentProject)
  const data = useLifeData()
  if (current === projectId) return null
  const project = data?.projects.find((p) => p.id === projectId)
  if (!project) return null
  return (
    <span className="inline-flex max-w-44 items-center gap-1.5 rounded-control bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      <span className={cn("size-2 shrink-0 rounded-full", ACCENT_CLASSES[project.color].bg)} />
      <span className="truncate">{project.name}</span>
    </span>
  )
}
