"use client"

import { CalendarClock, CircleCheck, FolderKanban, Hash, ListChecks, Plus } from "lucide-react"
import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Segmented } from "@/components/os/field"
import { PageHeader, PageTransition } from "@/components/os/page-header"
import { Panel, PanelHeader } from "@/components/os/panel"
import { EmptyState, StatTile } from "@/components/os/visuals"
import { AREA_META } from "@/lib/domain/areas"
import { daysBetween } from "@/lib/domain/dates"
import { compareProjects, nameFromTag, tagCandidates } from "@/lib/domain/projects"
import type { Project } from "@/lib/domain/types"
import { useUI } from "@/lib/stores/ui"
import { useLife, type Life } from "@/features/shell/use-life"
import { ProjectCard } from "./project-card"
import { ProjectWorkspace } from "./project-workspace"
import { useOpenProjectId } from "./route"
import { useProjectEvaluations } from "./shared"

type Shelf = "active" | "done" | "archived"

export function ProjectsView() {
  const life = useLife()
  const openId = useOpenProjectId()
  if (!life) {
    return (
      <div className="grid gap-4 @3xl/main:grid-cols-2 @6xl/main:grid-cols-3" aria-busy="true">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-56 rounded-panel" />
        ))}
      </div>
    )
  }
  return openId ? <ProjectWorkspace key={openId} id={openId} life={life} /> : <Projects life={life} />
}

const onShelf = (p: Project, shelf: Shelf) => (shelf === "active" ? p.status === "active" || p.status === "paused" : p.status === shelf)

function Projects({ life }: { life: Life }) {
  const { data, today } = life
  const openProjectEditor = useUI((s) => s.openProjectEditor)
  const evaluations = useProjectEvaluations(life)
  const [shelf, setShelf] = useState<Shelf>("active")
  const projects = data.projects
  const candidates = useMemo(() => tagCandidates(data.tasks, projects), [data.tasks, projects])

  if (!projects.length) return <FirstProject life={life} />

  const current = projects.filter((p) => onShelf(p, "active"))
  const paused = current.filter((p) => p.status === "paused").length
  const openTasks = current.reduce((n, p) => n + (evaluations.get(p.id)?.own.filter((t) => t.status !== "done").length ?? 0), 0)
  const dueThisWeek = current.reduce((n, p) => n + (evaluations.get(p.id)?.own.filter((t) => t.status !== "done" && t.dueDate && daysBetween(today, t.dueDate) <= 7).length ?? 0), 0)
  const nextDeadline = current.filter((p) => p.status === "active" && p.dueDate && p.dueDate >= today).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))[0]
  const finished = projects.filter((p) => p.status === "done")
  const shown = projects.filter((p) => onShelf(p, shelf)).sort(shelf === "done" ? (a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "") : compareProjects)
  const days = nextDeadline ? daysBetween(today, nextDeadline.dueDate!) : 0

  return (
    <PageTransition>
      <Header />

      <div className="mb-4 grid grid-cols-2 gap-3 @4xl/main:grid-cols-4">
        <StatTile label="Active" value={current.length - paused} sub={paused ? `${paused} paused` : "under way"} icon={FolderKanban} tone="violet" />
        <StatTile label="Open tasks" value={openTasks} sub={dueThisWeek ? `${dueThisWeek} due within a week` : "in your projects"} icon={ListChecks} tone="cyan" />
        <StatTile
          label="Next deadline"
          value={nextDeadline ? (days === 0 ? "Today" : `${days} day${days === 1 ? "" : "s"}`) : "–"}
          sub={nextDeadline ? <span className="line-clamp-1">{nextDeadline.name}</span> : "add deadlines to see them here"}
          icon={CalendarClock}
          tone="amber"
        />
        <StatTile label="Finished" value={finished.length} sub={`${finished.filter((p) => p.completedAt?.startsWith(today.slice(0, 4))).length} this year`} icon={CircleCheck} tone="mint" />
      </div>

      <div className="mb-4 flex justify-end">
        <Segmented<Shelf>
          ariaLabel="Which projects"
          value={shelf}
          onChange={setShelf}
          options={[
            { value: "active", label: "Active" },
            { value: "done", label: "Finished" },
            { value: "archived", label: "Archived" },
          ]}
        />
      </div>

      {shown.length ? (
        <div className="grid gap-4 @3xl/main:grid-cols-2 @6xl/main:grid-cols-3">
          {shown.map((p) => {
            const e = evaluations.get(p.id)
            return e ? <ProjectCard key={p.id} project={p} evaluation={e} goals={data.goals} today={today} /> : null
          })}
        </div>
      ) : (
        <Panel>
          <EmptyState
            compact
            icon={shelf === "done" ? CircleCheck : FolderKanban}
            title={shelf === "active" ? "No active projects" : shelf === "done" ? "Nothing finished yet" : "Nothing archived"}
            body={shelf === "done" ? "Projects you mark as finished collect here, with their history." : shelf === "archived" ? "Projects you set aside stay here, with their tasks and notes." : "Start one for the next bigger piece of work."}
            action={
              shelf === "active" ? (
                <Button size="sm" onClick={() => openProjectEditor(null)}>
                  <Plus /> New project
                </Button>
              ) : undefined
            }
          />
        </Panel>
      )}

      {shelf === "active" && candidates.length > 0 && <FromTags life={life} compact />}
    </PageTransition>
  )
}

function Header() {
  const openProjectEditor = useUI((s) => s.openProjectEditor)
  return (
    <PageHeader
      title="Projects"
      description="Bigger pieces of work, each with its own tasks, milestones, notes and links."
      actions={
        <Button onClick={() => openProjectEditor(null)}>
          <Plus /> New project
        </Button>
      }
    />
  )
}

/** Empty page: start from scratch, or from tags that were standing in for projects. */
function FirstProject({ life }: { life: Life }) {
  const openProjectEditor = useUI((s) => s.openProjectEditor)
  const hasTags = tagCandidates(life.data.tasks, life.data.projects).length > 0
  return (
    <PageTransition>
      <Header />
      <div className={hasTags ? "grid gap-4 @4xl/main:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]" : undefined}>
        <Panel>
          <EmptyState
            icon={FolderKanban}
            title="Start your first project"
            body="A thesis, a trip, a side project: give it a deadline and milestones, then add its tasks. Its page keeps the board, notes, links and history together, and its tasks still show up in Tasks and My Day."
            action={
              <Button onClick={() => openProjectEditor(null)}>
                <Plus /> Start a project
              </Button>
            }
          />
        </Panel>
        {hasTags && <FromTags life={life} />}
      </div>
    </PageTransition>
  )
}

/** Tags used like projects (on several tasks), offered as projects with those tasks inside. */
function FromTags({ life, compact = false }: { life: Life; compact?: boolean }) {
  const openProjectEditor = useUI((s) => s.openProjectEditor)
  const candidates = tagCandidates(life.data.tasks, life.data.projects)
  const start = (tag: string, area: Project["area"]) => {
    const taskIds = life.data.tasks.filter((t) => !t.projectId && t.tags.includes(tag)).map((t) => t.id)
    openProjectEditor(null, { name: nameFromTag(tag), area }, taskIds)
  }
  return (
    <Panel className={compact ? "mt-4" : undefined}>
      <PanelHeader title="From your tags" subtitle={compact ? "These tags are on several tasks. Make one a project and its tasks move in." : "Tasks you've tagged together. Make a tag a project and its tasks move in."} />
      <ul className="flex flex-wrap gap-2">
        {candidates.map((c) => (
          <li key={c.tag}>
            <button
              type="button"
              onClick={() => start(c.tag, c.area)}
              className="pressable inline-flex items-center gap-2 rounded-full bg-surface-2/80 py-1.5 pr-3 pl-2.5 text-sm ring-1 ring-line transition-colors hover:bg-surface-3"
            >
              <Hash className="size-3.5 text-muted-foreground" />
              <span className="font-medium">{c.tag}</span>
              <span className="text-xs text-muted-foreground">
                {c.count} task{c.count === 1 ? "" : "s"} · {AREA_META[c.area].label}
              </span>
              <Plus className="size-3.5 text-violet" />
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
