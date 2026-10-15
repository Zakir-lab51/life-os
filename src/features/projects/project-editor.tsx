"use client"

import { useLiveQuery } from "dexie-react-hooks"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { DiscardBar, revealFirstError, useCloseGuard, useUnsaved, type CloseGuard } from "@/components/os/editor-guard"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { DatePicker } from "@/components/os/date-picker"
import { Field } from "@/components/os/field"
import { PROJECT_ICONS } from "@/components/os/icon"
import { MilestoneEditor } from "@/components/os/milestones"
import { db } from "@/lib/db/db"
import { useProject } from "@/lib/db/hooks"
import { ValidationError, createProject, updateProject } from "@/lib/db/repo"
import { ACCENT_CLASSES, AREA_META } from "@/lib/domain/areas"
import { todayISO } from "@/lib/domain/dates"
import { HORIZON_META } from "@/lib/domain/goals"
import { AREAS, type AccentColor, type ID, type Project } from "@/lib/domain/types"
import { reportError } from "@/lib/feedback"
import type { ProjectInput } from "@/lib/validation/schemas"
import { useUI } from "@/lib/stores/ui"
import { cn } from "@/lib/utils"
import { openProject } from "./route"
import { ProjectGlyph } from "./shared"

const COLORS: AccentColor[] = ["violet", "lilac", "blue", "cyan", "mint", "amber", "rose"]

type Draft = Required<Omit<ProjectInput, "notes" | "links">>

function toDraft(p: Project | null, defaults: Partial<ProjectInput> | null): Draft {
  return {
    name: p?.name ?? defaults?.name ?? "",
    description: p?.description ?? defaults?.description ?? "",
    area: p?.area ?? defaults?.area ?? "work",
    icon: p?.icon ?? defaults?.icon ?? "FolderKanban",
    color: p?.color ?? defaults?.color ?? "violet",
    startDate: p?.startDate ?? defaults?.startDate ?? todayISO(),
    dueDate: p ? p.dueDate : (defaults?.dueDate ?? null),
    milestones: p?.milestones ?? defaults?.milestones ?? [],
    goalId: p ? p.goalId : (defaults?.goalId ?? null),
  }
}

/** New project / edit project. Notes and links are edited on the project's own page. */
export function ProjectEditorDialog() {
  const { open, projectId, defaults, taskIds } = useUI((s) => s.projectEditor)
  const close = useUI((s) => s.closeProjectEditor)
  const guard = useCloseGuard(close)
  const project = useProject(projectId)
  const ready = !projectId || project !== undefined

  return (
    <Dialog open={open} onOpenChange={(o) => !o && guard.requestClose()}>
      <DialogContent className="max-h-[92dvh] gap-0 overflow-hidden rounded-dialog p-0 sm:max-w-2xl">
        {open &&
          ready &&
          (project === null && projectId ? (
            <div className="p-8 text-center">
              <DialogTitle>Project not found</DialogTitle>
              <DialogDescription className="mt-2">It may have been deleted.</DialogDescription>
            </div>
          ) : (
            <ProjectForm key={projectId ?? "new"} project={project ?? null} defaults={defaults} taskIds={taskIds} onDone={guard.close} guard={guard} />
          ))}
      </DialogContent>
    </Dialog>
  )
}

function ProjectForm({ project, defaults, taskIds, onDone, guard }: { project: Project | null; defaults: Partial<ProjectInput> | null; taskIds: ID[]; onDone: () => void; guard: CloseGuard }) {
  const router = useRouter()
  const [d, setD] = useState<Draft>(() => toDraft(project, defaults))
  const [errors, setErrors] = useState<Record<string, string>>({})
  useUnsaved(guard, d)
  const [saving, setSaving] = useState(false)
  const goals = useLiveQuery(() => db.goals.orderBy("order").filter((g) => g.status === "active" || g.id === d.goalId).toArray(), [d.goalId])
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }))

  const save = async () => {
    setSaving(true)
    setErrors({})
    try {
      if (project) {
        await updateProject(project.id, d)
        toast.success("Project saved")
        onDone()
      } else {
        const created = await createProject(d, { taskIds })
        onDone()
        openProject(created.id, router.push)
        toast.success("Project started", { description: taskIds.length ? `${created.name} · ${taskIds.length} task${taskIds.length === 1 ? "" : "s"} moved in` : created.name })
      }
    } catch (e) {
      if (e instanceof ValidationError) {
        setErrors(e.fields)
        revealFirstError()
      } else reportError(e)
    } finally {
      setSaving(false)
    }
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
        <DialogTitle>{project ? "Edit project" : "New project"}</DialogTitle>
        <DialogDescription>{taskIds.length && !project ? `${taskIds.length} task${taskIds.length === 1 ? "" : "s"} will move into it.` : "A bigger piece of work, with its own tasks, milestones and notes."}</DialogDescription>
      </DialogHeader>

      <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
        <div className="flex items-start gap-3">
          <ProjectGlyph project={d} className="mt-6" />
          <Field label="Project" htmlFor="project-name" error={errors.name} className="flex-1">
            <Input id="project-name" autoFocus value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Research poster" maxLength={120} className="h-11 rounded-xl text-base" />
          </Field>
        </div>
        <Field label="What done looks like" htmlFor="project-description" hint="Optional. Shown under the name.">
          <Textarea id="project-description" value={d.description} onChange={(e) => set("description", e.target.value)} placeholder="The outcome, in a sentence" maxLength={2000} className="min-h-16 rounded-xl" />
        </Field>

        <Field label="Icon and colour">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Icon">
              {Object.entries(PROJECT_ICONS).map(([key, I]) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={d.icon === key}
                  aria-label={key}
                  onClick={() => set("icon", key)}
                  className={cn("grid size-9 place-items-center rounded-xl border transition-colors", d.icon === key ? cn("border-transparent", ACCENT_CLASSES[d.color].soft, ACCENT_CLASSES[d.color].text) : "border-line text-muted-foreground hover:text-foreground")}
                >
                  <I className="size-4" />
                </button>
              ))}
            </div>
            <div className="flex gap-2" role="radiogroup" aria-label="Colour">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={d.color === c}
                  aria-label={c}
                  onClick={() => set("color", c)}
                  className={cn("size-7 rounded-full ring-offset-2 ring-offset-background transition-all", ACCENT_CLASSES[c].bg, d.color === c && "ring-2 ring-foreground")}
                />
              ))}
            </div>
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Area" htmlFor="project-area" hint="New tasks in it start in this area.">
            <Select value={d.area} onValueChange={(v) => set("area", v as Project["area"])}>
              <SelectTrigger id="project-area" className="h-10 w-full rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AREAS.map((a) => (
                  <SelectItem key={a} value={a}>
                    {AREA_META[a].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Starts" htmlFor="project-start" error={errors.startDate}>
            <DatePicker id="project-start" value={d.startDate} allowClear={false} onChange={(v) => v && set("startDate", v)} />
          </Field>
          <Field label="Deadline" htmlFor="project-due" error={errors.dueDate}>
            <DatePicker id="project-due" value={d.dueDate} placeholder="No deadline" invalid={!!errors.dueDate} onChange={(v) => set("dueDate", v)} />
          </Field>
        </div>

        <Field label="Serves" htmlFor="project-goal" error={errors.goalId} hint="A goal this project moves forward. It shows on the goal's page.">
          <Select value={d.goalId ?? "none"} onValueChange={(v) => set("goalId", v === "none" ? null : v)}>
            <SelectTrigger id="project-goal" className="h-10 w-full rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No goal</SelectItem>
              {(goals ?? []).map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {HORIZON_META[g.horizon].adjective}: {g.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label={`Milestones${d.milestones.length ? ` · ${d.milestones.length}` : ""}`} hint="The big steps along the way. Progress counts the project's tasks; milestones show beside it." error={errors.milestones}>
          <MilestoneEditor value={d.milestones} onChange={(v) => set("milestones", v)} />
        </Field>
      </div>

      <DialogFooter className="border-t border-line px-6 py-4">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving || !d.name.trim()}>
          {project ? "Save" : "Start project"}
        </Button>
      </DialogFooter>
      <DiscardBar guard={guard} />
    </form>
  )
}
