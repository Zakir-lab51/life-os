"use client"

import { useLiveQuery } from "dexie-react-hooks"
import { CalendarHeart, ChevronDown, Ellipsis, FileText, FileUp, FolderDown, FolderUp, Inbox, Lightbulb, Pin, Plus, Search, Waypoints } from "lucide-react"
import { useRouter } from "next/navigation"
import { useLayoutEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { PageHeader, PageTransition } from "@/components/os/page-header"
import { Panel, PanelHeader } from "@/components/os/panel"
import { EmptyState } from "@/components/os/visuals"
import { db } from "@/lib/db/db"
import { downloadText } from "@/lib/db/backup"
import { captureIdea, createNote, importNotes, openJournal, type NoteDraft } from "@/lib/db/repo"
import { addDays, formatDay, toISODate } from "@/lib/domain/dates"
import { BUILT_IN_TEMPLATES, folderList, inFolder, searchNotes, snippet, tagList, type NoteHit } from "@/lib/domain/notes"
import type { Note } from "@/lib/domain/types"
import { attempt } from "@/lib/feedback"
import { cn } from "@/lib/utils"
import { useLife, type Life } from "@/features/shell/use-life"
import { markdownToDraft, notesZip } from "./markdown"
import { NoteEditor } from "./note-editor"
import { NoteGraph } from "./note-graph"
import { setNoteTitles } from "./note-index"
import { openNote, useOpenNoteId } from "./route"

/** What the list shows: a view, a folder ("folder:Physiology") or a tag ("tag:exam"). */
type Scope = string

export function NotesView() {
  const notes = useLiveQuery(() => db.notes.toArray(), [])
  const life = useLife()
  // links inside the editor read titles from here, so it's filled before the editor draws
  useLayoutEffect(() => {
    if (notes) setNoteTitles(notes)
  }, [notes])
  if (!notes || !life) {
    return (
      <div className="grid gap-4 @4xl/main:grid-cols-[20rem_minmax(0,1fr)]" aria-busy="true">
        <Skeleton className="h-[70vh] rounded-panel" />
        <Skeleton className="hidden h-[70vh] rounded-panel @4xl/main:block" />
      </div>
    )
  }
  return <Notes notes={notes} life={life} />
}

function inScope(n: Note, scope: Scope) {
  if (scope === "all") return n.kind === "note"
  if (scope === "inbox") return n.inbox
  if (scope === "journal") return n.kind === "journal"
  if (scope === "pinned") return n.pinned && n.kind !== "template"
  if (scope === "templates") return n.kind === "template"
  if (scope.startsWith("folder:")) return n.kind === "note" && inFolder(n, scope.slice(7))
  if (scope.startsWith("tag:")) return n.kind !== "template" && n.tags.includes(scope.slice(4))
  return true
}

function Notes({ notes, life }: { notes: Note[]; life: Life }) {
  const router = useRouter()
  const navigate = (href: string) => router.push(href)
  const openId = useOpenNoteId()
  const [scope, setScope] = useState<Scope>("all")
  const [query, setQuery] = useState("")
  const [graph, setGraph] = useState(false)
  const open = openId ? notes.find((n) => n.id === openId) : undefined
  // a note opened from a link or the graph takes over from the graph
  const [seenOpen, setSeenOpen] = useState(openId)
  if (openId !== seenOpen) {
    setSeenOpen(openId)
    if (openId) setGraph(false)
  }

  const today = life.today
  const hits: NoteHit[] = useMemo(() => {
    const inView = query.trim() ? notes : notes.filter((n) => inScope(n, scope))
    const found = searchNotes(inView, query)
    if (query.trim()) return found
    const journal = scope === "journal"
    return found.sort((a, b) => (journal ? (b.note.date ?? "").localeCompare(a.note.date ?? "") : Number(b.note.pinned) - Number(a.note.pinned) || b.note.updatedAt.localeCompare(a.note.updatedAt)))
  }, [notes, scope, query])

  const newNote = async (template?: { title: string; content: Note["content"] }) => {
    const folder = scope.startsWith("folder:") ? scope.slice(7) : null
    const tags = scope.startsWith("tag:") ? [scope.slice(4)] : []
    const made = await attempt(() => createNote({ title: template?.title ?? "", content: template?.content, folder, tags }))
    if (made) openNote(made.id, navigate)
  }
  const todayJournal = async () => {
    const entry = await attempt(() => openJournal(today))
    if (entry) openNote(entry.id, navigate)
  }

  return (
    <PageTransition>
      <PageHeader
        title="Second Brain"
        description="Notes that link to each other, a journal for every day, and an inbox for ideas."
        actions={
          <>
            <Button variant="outline" onClick={() => void todayJournal()}>
              <CalendarHeart /> Today
            </Button>
            <Button variant={graph ? "default" : "outline"} aria-pressed={graph} onClick={() => setGraph((g) => !g)}>
              <Waypoints /> Graph
            </Button>
            <ImportExport notes={notes} today={today} />
            <NewNoteMenu notes={notes} today={today} onNew={(t) => void newNote(t)} />
          </>
        }
      />

      <div className="grid gap-4 @4xl/main:grid-cols-[20rem_minmax(0,1fr)]">
        <Panel as="div" className={cn("gap-3 p-3 sm:p-3 @4xl/main:sticky @4xl/main:top-[84px] @4xl/main:max-h-[calc(100dvh-6.5rem)]", (open || graph) && "hidden @4xl/main:flex")}>
          <label className="relative block">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search all notes"
              aria-label="Search all notes"
              className="h-10 w-full rounded-control border border-line bg-surface pr-3 pl-9 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
            />
          </label>
          {!query.trim() && <ScopePicker notes={notes} scope={scope} onChange={setScope} />}
          <NoteList hits={hits} openId={openId} today={today} query={query} scope={scope} onNew={() => void newNote()} onJournal={() => void todayJournal()} />
        </Panel>

        <div className={cn("min-w-0", !open && !graph && "hidden @4xl/main:block")}>
          {graph ? (
            <NoteGraph notes={notes} />
          ) : open ? (
            <NoteEditor key={open.id} note={open} notes={notes} today={today} reflections={life.data.reflections} />
          ) : openId ? (
            <Panel>
              <EmptyState compact icon={FileText} title="This note isn't here" body="It may have been deleted, or it's on another device." />
            </Panel>
          ) : (
            <Home notes={notes} today={today} onJournal={() => void todayJournal()} />
          )}
        </div>
      </div>
    </PageTransition>
  )
}

function ScopePicker({ notes, scope, onChange }: { notes: Note[]; scope: Scope; onChange: (s: Scope) => void }) {
  const folders = useMemo(() => folderList(notes.filter((n) => n.kind === "note")), [notes])
  const tags = useMemo(() => tagList(notes.filter((n) => n.kind !== "template")), [notes])
  const count = (s: Scope) => notes.filter((n) => inScope(n, s)).length
  const views: { value: Scope; label: string }[] = [
    { value: "all", label: "All notes" },
    { value: "inbox", label: "Inbox" },
    { value: "journal", label: "Journal" },
    { value: "pinned", label: "Pinned" },
    { value: "templates", label: "Templates" },
  ]
  return (
    <Select value={scope} onValueChange={onChange}>
      <SelectTrigger className="h-10 w-full rounded-control bg-surface" aria-label="Show">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {views.map((v) => (
            <SelectItem key={v.value} value={v.value}>
              {v.label} <span className="text-muted-foreground tabular">{count(v.value)}</span>
            </SelectItem>
          ))}
        </SelectGroup>
        {folders.length > 0 && (
          <>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Folders</SelectLabel>
              {folders.map((f) => (
                <SelectItem key={f.path} value={`folder:${f.path}`}>
                  <span style={{ paddingLeft: f.depth * 12 }}>{f.name}</span> <span className="text-muted-foreground tabular">{f.count}</span>
                </SelectItem>
              ))}
            </SelectGroup>
          </>
        )}
        {tags.length > 0 && (
          <>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Tags</SelectLabel>
              {tags.map((t) => (
                <SelectItem key={t.tag} value={`tag:${t.tag}`}>
                  #{t.tag} <span className="text-muted-foreground tabular">{t.count}</span>
                </SelectItem>
              ))}
            </SelectGroup>
          </>
        )}
      </SelectContent>
    </Select>
  )
}

/** "9:41 pm" today, "Yesterday", "Mon", "3 Oct", "3 Oct 2025" */
function when(note: Note, today: string) {
  if (note.kind === "journal" && note.date) return formatDay(note.date, note.date.slice(0, 4) === today.slice(0, 4) ? "EEE d MMM" : "d MMM yyyy")
  const d = new Date(note.updatedAt)
  const day = toISODate(d)
  if (day === today) return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  if (day === addDays(today, -1)) return "Yesterday"
  if (day > addDays(today, -7)) return formatDay(day, "EEE")
  return formatDay(day, day.slice(0, 4) === today.slice(0, 4) ? "d MMM" : "d MMM yyyy")
}

function NoteList({ hits, openId, today, query, scope, onNew, onJournal }: { hits: NoteHit[]; openId: string | null; today: string; query: string; scope: Scope; onNew: () => void; onJournal: () => void }) {
  const router = useRouter()
  if (!hits.length) {
    return (
      <EmptyState
        compact
        icon={query.trim() ? Search : scope === "inbox" ? Inbox : scope === "journal" ? CalendarHeart : FileText}
        tone={scope === "inbox" && !query.trim() ? "clear" : "start"}
        title={query.trim() ? "Nothing matches" : scope === "inbox" ? "Inbox is clear" : scope === "journal" ? "No journal entries yet" : "No notes here yet"}
        body={query.trim() ? "Search looks through every note's title, text, folder and tags." : scope === "inbox" ? "Ideas you capture (Q, then Idea) land here until you file them." : undefined}
        action={
          query.trim() ? undefined : scope === "journal" ? (
            <Button size="sm" onClick={onJournal}>
              <CalendarHeart /> Write today&apos;s
            </Button>
          ) : scope !== "inbox" ? (
            <Button size="sm" onClick={onNew}>
              <Plus /> New note
            </Button>
          ) : undefined
        }
      />
    )
  }
  return (
    <ul className="-mx-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1 pb-1" aria-label="Notes">
      {hits.map(({ note, snippet: text }) => (
        <li key={note.id}>
          <button
            type="button"
            aria-current={note.id === openId ? "true" : undefined}
            onClick={() => openNote(note.id, (h) => router.push(h))}
            className={cn("pressable w-full rounded-xl px-3 py-2.5 text-left [--press-scale:0.99]", note.id === openId ? "bg-foreground/[0.08]" : "hover:bg-foreground/[0.04]")}
          >
            <span className="flex items-center gap-1.5">
              {note.pinned && <Pin className="size-3 shrink-0 text-violet" aria-label="Pinned" />}
              {note.inbox && <span className="size-1.5 shrink-0 rounded-full bg-amber" aria-label="In inbox" />}
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{note.title || "Untitled"}</span>
            </span>
            <span className="mt-0.5 flex gap-2 text-xs text-muted-foreground">
              <span className="shrink-0 tabular">{when(note, today)}</span>
              <span className="line-clamp-2 min-w-0">{text || (note.kind === "template" ? "Template" : "No text yet")}</span>
            </span>
            {(note.folder || note.tags.length > 0) && (
              <span className="mt-1 flex flex-wrap gap-1 text-[11px] text-muted-foreground">
                {note.folder && <span className="rounded-control bg-surface-2 px-1.5 py-0.5">{note.folder.split("/").pop()}</span>}
                {note.tags.slice(0, 3).map((t) => (
                  <span key={t} className="rounded-control bg-surface-2 px-1.5 py-0.5">
                    #{t}
                  </span>
                ))}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  )
}

/** With no note open (wide screens): today's journal, a box to catch an idea, the inbox and recent notes. */
function Home({ notes, today, onJournal }: { notes: Note[]; today: string; onJournal: () => void }) {
  const router = useRouter()
  const [idea, setIdea] = useState("")
  const inbox = notes.filter((n) => n.inbox).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const recent = notes
    .filter((n) => n.kind === "note")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 6)
  const wroteToday = notes.some((n) => n.kind === "journal" && n.date === today)
  const save = async () => {
    const made = await attempt(() => captureIdea(idea))
    if (!made) return
    setIdea("")
    toast.success("Saved to your inbox", { description: made.title })
  }
  const open = (id: string) => openNote(id, (h) => router.push(h))
  return (
    <div className="grid gap-4 @3xl/main:grid-cols-2">
      <Panel>
        <PanelHeader title="Today's journal" subtitle={formatDay(today, "EEEE, d MMMM")} icon={CalendarHeart} tone="rose" />
        <p className="text-sm text-muted-foreground">{wroteToday ? "Pick up where you left off." : "Your focus, what you're grateful for, and what you learned. A page a day."}</p>
        <Button className="mt-4 self-start" onClick={onJournal}>
          {wroteToday ? "Open today's entry" : "Start today's entry"}
        </Button>
      </Panel>
      <Panel>
        <PanelHeader title="Catch an idea" subtitle="It waits in your inbox until you file it." icon={Lightbulb} tone="amber" />
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
          className="space-y-2"
        >
          <Textarea value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="A thought, a question, something to look up…" aria-label="Idea" maxLength={4000} className="min-h-20 rounded-xl" />
          <Button type="submit" size="sm" variant="secondary" disabled={!idea.trim()}>
            <Inbox /> Save to inbox
          </Button>
        </form>
      </Panel>
      <Panel>
        <PanelHeader title="Inbox" subtitle={inbox.length ? `${inbox.length} to sort` : "All filed"} />
        {inbox.length ? (
          <ul className="space-y-1">
            {inbox.slice(0, 6).map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => open(n.id)} className="w-full truncate rounded-lg px-2 py-1.5 text-left text-sm hover:bg-foreground/[0.04]">
                  {n.title || "Untitled"}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing waiting.</p>
        )}
      </Panel>
      <Panel>
        <PanelHeader title="Recently edited" />
        {recent.length ? (
          <ul className="space-y-1">
            {recent.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => open(n.id)} className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-foreground/[0.04]">
                  <span className="block truncate text-sm font-medium">{n.title || "Untitled"}</span>
                  <span className="block truncate text-xs text-muted-foreground">{snippet(n.text, "", 80) || "No text yet"}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Notes you write show up here.</p>
        )}
      </Panel>
    </div>
  )
}

/** New note: blank, or from a built-in template or one of yours. */
function NewNoteMenu({ notes, today, onNew }: { notes: Note[]; today: string; onNew: (t?: { title: string; content: Note["content"] }) => void }) {
  const mine = notes.filter((n) => n.kind === "template").sort((a, b) => a.title.localeCompare(b.title))
  return (
    <div className="flex">
      <Button className="rounded-r-none" onClick={() => onNew()}>
        <Plus /> New note
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="rounded-l-none border-l border-primary-foreground/20 px-2" aria-label="New note from a template">
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Start from a template</DropdownMenuLabel>
          {BUILT_IN_TEMPLATES.map((t) => (
            <DropdownMenuItem key={t.id} onSelect={() => onNew({ title: t.title(today), content: t.content() })}>
              <span className="flex min-w-0 flex-col">
                <span>{t.name}</span>
                <span className="truncate text-xs text-muted-foreground">{t.description}</span>
              </span>
            </DropdownMenuItem>
          ))}
          {mine.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Yours</DropdownMenuLabel>
              {mine.map((t) => (
                <DropdownMenuItem key={t.id} onSelect={() => onNew({ title: "", content: t.content })}>
                  <FileText /> {t.title || "Untitled template"}
                </DropdownMenuItem>
              ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

const MAX_FILE = 2 * 1024 * 1024

/** Import Markdown files (or a folder of them, keeping its folders) and export everything as a zip. */
function ImportExport({ notes, today }: { notes: Note[]; today: string }) {
  const files = useRef<HTMLInputElement>(null)
  const folder = useRef<HTMLInputElement>(null)
  const read = async (list: FileList | null) => {
    const picked = [...(list ?? [])].filter((f) => /\.(md|markdown|txt)$/i.test(f.name))
    if (!picked.length) return toast.error("No Markdown files there", { description: "Choose .md, .markdown or .txt files." })
    const drafts: NoteDraft[] = []
    let skipped = 0
    for (const f of picked) {
      if (f.size > MAX_FILE) {
        skipped++
        continue
      }
      // inside a picked folder: "Vault/Physiology/Renal.md" keeps "Physiology" as its folder
      const parts = (f.webkitRelativePath || f.name).split("/")
      const dir = parts.length > 2 ? parts.slice(1, -1).join("/") : null
      drafts.push(markdownToDraft(f.name, await f.text(), dir))
    }
    const made = await attempt(() => importNotes(drafts))
    if (made) toast.success(`Imported ${made.length} note${made.length === 1 ? "" : "s"}`, { description: skipped ? `${skipped} file${skipped === 1 ? " was" : "s were"} over 2 MB and left out.` : "Links written [[like this]] now point to their notes." })
  }
  const exportAll = () => {
    if (!notes.length) return toast("No notes to export yet")
    downloadText(`life-os-notes-${today}.zip`, notesZip(notes), "application/zip")
    toast.success(`Exported ${notes.length} note${notes.length === 1 ? "" : "s"}`, { description: "A zip of Markdown files, one per note, in their folders." })
  }
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Import and export">
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem onSelect={() => files.current?.click()}>
            <FileUp /> Import Markdown files…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => folder.current?.click()}>
            <FolderUp /> Import a folder…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={exportAll}>
            <FolderDown /> Export all as Markdown (.zip)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        ref={files}
        type="file"
        accept=".md,.markdown,.txt,text/markdown,text/plain"
        multiple
        hidden
        onChange={(e) => {
          void read(e.target.files)
          e.target.value = ""
        }}
      />
      <input
        ref={(el) => {
          folder.current = el
          el?.setAttribute("webkitdirectory", "")
        }}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          void read(e.target.files)
          e.target.value = ""
        }}
      />
    </>
  )
}
