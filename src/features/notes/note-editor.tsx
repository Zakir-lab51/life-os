"use client"

import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react"
import {
  Bold,
  Brackets,
  ChevronLeft,
  ChevronRight,
  Code,
  Copy,
  Ellipsis,
  FileDown,
  FileText,
  Folder,
  Heading1,
  Heading2,
  Heading3,
  Inbox,
  Italic,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Pin,
  PinOff,
  Redo2,
  SquareCode,
  Strikethrough,
  TextQuote,
  Trash2,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Panel } from "@/components/os/panel"
import { downloadText } from "@/lib/db/backup"
import { createNote, deleteNote, openJournal, restoreNote, updateNote } from "@/lib/db/repo"
import { addDays, formatDay, toISODate } from "@/lib/domain/dates"
import { backlinks, folderList, unlinkedMentions } from "@/lib/domain/notes"
import { normalizeTag } from "@/lib/domain/tasks"
import type { Note, Reflection } from "@/lib/domain/types"
import { attempt, succeeded } from "@/lib/feedback"
import { cn, uid } from "@/lib/utils"
import { noteExtensions } from "./extensions"
import { fileName, noteToMarkdown } from "./markdown"
import type { LinkTarget } from "./note-link"
import { startNoteLink } from "./note-link"
import { closeNote, openNote } from "./route"

const SAVE_AFTER = 600 // ms after the last keystroke

// the [[ link list and link taps read the latest notes from here (one note is open at a time)
const live: { notes: Note[]; note: Note | null; navigate: (href: string) => void } = { notes: [], note: null, navigate: () => undefined }

/** "Edited today, 9:41 pm", "Edited 3 Oct" */
function editedText(iso: string, today: string) {
  const d = new Date(iso)
  const day = toISODate(d)
  if (day === today) return `Edited today, ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
  if (day === addDays(today, -1)) return "Edited yesterday"
  return `Edited ${formatDay(day, day.slice(0, 4) === today.slice(0, 4) ? "d MMM" : "d MMM yyyy")}`
}

/**
 * One note: its title, folder, tags and pin, the formatting bar, the document, and what
 * links to it. Everything saves as you go: the body a moment after you stop typing (and
 * when you leave), the title, folder and tags as you change them.
 */
export function NoteEditor({ note, notes, today, reflections }: { note: Note; notes: Note[]; today: string; reflections: Reflection[] }) {
  const router = useRouter()
  useEffect(() => {
    live.notes = notes
    live.note = note
    live.navigate = (href) => router.push(href)
  })

  // the document as last typed, until it's saved
  const pending = useRef<Note["content"] | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const save = () => {
    window.clearTimeout(timer.current)
    timer.current = undefined
    const content = pending.current
    if (!content) return
    void attempt(() => updateNote(note.id, { content })).then(() => {
      if (pending.current === content) pending.current = null
    })
  }

  const editor = useEditor(
    {
      extensions: noteExtensions({
        find: (query) => {
          const q = query.toLowerCase()
          return live.notes
            .filter((n) => n.id !== live.note?.id && n.kind !== "template" && (!q || n.title.toLowerCase().includes(q)))
            .sort((a, b) => Number(b.title.toLowerCase().startsWith(q)) - Number(a.title.toLowerCase().startsWith(q)) || b.updatedAt.localeCompare(a.updatedAt))
            .map((n): LinkTarget => ({ id: n.id, title: n.title, folder: n.folder }))
        },
        create: (title, id) => {
          const made = id ?? uid("n_")
          void attempt(() => createNote({ title, folder: live.note?.folder ?? null }, { id: made }))
          return made
        },
        open: (id) => openNote(id, live.navigate),
      }),
      content: note.content,
      // LIFE OS draws its pages only in the browser (ClientGate), so the editor can appear in the first render
      immediatelyRender: true,
      editorProps: { attributes: { class: "note-body", "aria-label": "Note", spellcheck: "true" } },
      onUpdate: ({ editor: e }) => {
        pending.current = e.getJSON() as Note["content"]
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(save, SAVE_AFTER)
      },
      onBlur: () => {
        if (timer.current !== undefined) save()
      },
    },
    [note.id],
  )

  // a change made on another device comes in while you aren't typing here
  useEffect(() => {
    if (!editor || pending.current || editor.isFocused) return
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(note.content)) editor.commands.setContent(note.content, { emitUpdate: false })
  }, [editor, note.content])

  // leaving the note (or the page) saves what was typed last
  useEffect(
    () => () => {
      const content = pending.current
      window.clearTimeout(timer.current)
      if (content) void attempt(() => updateNote(note.id, { content }))
    },
    [note.id],
  )

  return (
    <Panel className="gap-0 p-0 sm:p-0">
      <div className="px-5 pt-5 sm:px-7 sm:pt-6">
        <button type="button" onClick={closeNote} className="pressable mb-3 -ml-1 inline-flex items-center gap-1 rounded-full px-1 py-0.5 text-sm font-medium text-muted-foreground hover:text-foreground @4xl/main:hidden">
          <ChevronLeft className="size-4" /> Notes
        </button>
        {note.kind === "journal" && note.date && <JournalBar date={note.date} today={today} reflection={reflections.find((r) => r.date === note.date)} />}
        <TitleField note={note} onEnter={() => editor?.commands.focus("start")} />
        <MetaRow note={note} notes={notes} today={today} />
      </div>
      {editor && <Toolbar editor={editor} />}
      <div className="px-5 pt-3 pb-6 sm:px-7">{editor ? <EditorContent editor={editor} /> : <div className="note-body min-h-40" />}</div>
      <Connections note={note} notes={notes} />
    </Panel>
  )
}

/* ── title, folder, tags ────────────────────────────── */

function TitleField({ note, onEnter }: { note: Note; onEnter: () => void }) {
  const [title, setTitle] = useState(note.title)
  const [seen, setSeen] = useState(note.title)
  const [editing, setEditing] = useState(false)
  if (note.title !== seen) {
    setSeen(note.title)
    if (!editing) setTitle(note.title)
  }
  const timer = useRef<number | undefined>(undefined)
  const commit = (value: string) => {
    window.clearTimeout(timer.current)
    timer.current = undefined
    if (value.trim() !== note.title) void attempt(() => updateNote(note.id, { title: value }))
  }
  return (
    <textarea
      value={title}
      rows={1}
      onChange={(e) => {
        const value = e.target.value.replace(/\n/g, " ")
        setTitle(value)
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => commit(value), SAVE_AFTER)
      }}
      onFocus={() => setEditing(true)}
      onBlur={() => {
        setEditing(false)
        commit(title)
      }}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return
        e.preventDefault()
        commit(title)
        onEnter()
      }}
      placeholder="Untitled"
      aria-label="Title"
      maxLength={200}
      className="field-sizing-content w-full resize-none bg-transparent text-[1.75rem] leading-tight font-semibold tracking-tight outline-none placeholder:text-muted-foreground/60 sm:text-[2rem]"
    />
  )
}

function MetaRow({ note, notes, today }: { note: Note; notes: Note[]; today: string }) {
  const router = useRouter()
  const listId = useId()
  const folders = useMemo(() => folderList(notes).map((f) => f.path), [notes])
  const allTags = useMemo(() => [...new Set(notes.flatMap((n) => n.tags))].sort(), [notes])
  const [folder, setFolder] = useState(note.folder ?? "")
  const [seenFolder, setSeenFolder] = useState(note.folder)
  if (note.folder !== seenFolder) {
    setSeenFolder(note.folder)
    setFolder(note.folder ?? "")
  }
  const saveFolder = () => {
    if ((folder.trim() || null) !== note.folder) void attempt(() => updateNote(note.id, { folder: folder || null }))
  }

  const remove = async () => {
    const snapshot = await attempt(() => deleteNote(note.id))
    if (!snapshot) return
    closeNote()
    toast("Note deleted", { description: note.title || "Untitled", action: { label: "Undo", onClick: () => void succeeded(() => restoreNote(snapshot)) } })
  }
  const duplicate = async (asTemplate: boolean) => {
    const made = await attempt(() => createNote({ title: asTemplate ? note.title : `${note.title || "Untitled"} (copy)`, content: note.content, tags: note.tags, folder: note.folder, kind: asTemplate ? "template" : "note" }))
    if (!made) return
    toast.success(asTemplate ? "Saved as a template" : "Note duplicated", { description: asTemplate ? "Find it under New note." : made.title, action: { label: "Open", onClick: () => openNote(made.id, (h) => router.push(h)) } })
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
      <span>{editedText(note.updatedAt, today)}</span>
      {note.kind !== "journal" && (
        <label className="inline-flex items-center gap-1.5 rounded-full bg-surface-2/70 py-1 pr-1 pl-2.5 ring-1 ring-line focus-within:ring-2 focus-within:ring-ring">
          <Folder className="size-3.5 shrink-0" />
          <input
            value={folder}
            list={listId}
            onChange={(e) => setFolder(e.target.value)}
            onBlur={saveFolder}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            placeholder="No folder"
            aria-label="Folder (use / for a folder inside another)"
            maxLength={120}
            className="field-sizing-content max-w-56 min-w-16 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
          />
          <datalist id={listId}>
            {folders.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </label>
      )}
      <TagsField note={note} suggestions={allTags} />
      {note.inbox && (
        <button type="button" onClick={() => void attempt(() => updateNote(note.id, { inbox: false }))} className="pressable inline-flex items-center gap-1.5 rounded-full bg-amber/20 px-2.5 py-1 font-medium text-foreground ring-1 ring-amber/40" title="Take it out of the inbox">
          <Inbox className="size-3.5" /> In inbox · File it
        </button>
      )}
      {note.kind === "template" && <span className="rounded-full bg-violet/15 px-2.5 py-1 font-medium text-foreground ring-1 ring-violet/30">Template</span>}
      <div className="ml-auto flex items-center gap-1">
        <Button size="icon-sm" variant="ghost" aria-label={note.pinned ? "Unpin" : "Pin to the top"} aria-pressed={note.pinned} onClick={() => void attempt(() => updateNote(note.id, { pinned: !note.pinned }))}>
          {note.pinned ? <PinOff /> : <Pin />}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon-sm" variant="ghost" aria-label="More note actions">
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onSelect={() => downloadText(`${fileName(note.title)}.md`, noteToMarkdown(note), "text/markdown")}>
              <FileDown /> Export as Markdown
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                void navigator.clipboard
                  ?.writeText(noteToMarkdown(note))
                  .then(() => toast.success("Copied as Markdown"))
                  .catch(() => toast.error("Couldn't copy here"))
              }
            >
              <Copy /> Copy as Markdown
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void duplicate(false)}>
              <FileText /> Duplicate
            </DropdownMenuItem>
            {note.kind === "note" && (
              <DropdownMenuItem onSelect={() => void duplicate(true)}>
                <FileText /> Save as a template
              </DropdownMenuItem>
            )}
            {note.kind === "note" && !note.inbox && (
              <DropdownMenuItem onSelect={() => void attempt(() => updateNote(note.id, { inbox: true }))}>
                <Inbox /> Move to inbox
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => void remove()}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

/** Tags as chips, with a small field to add one (suggestions while you type). */
function TagsField({ note, suggestions }: { note: Note; suggestions: string[] }) {
  const listId = useId()
  const [draft, setDraft] = useState("")
  const save = (tags: string[]) => void attempt(() => updateNote(note.id, { tags }))
  const add = () => {
    const tag = normalizeTag(draft)
    setDraft("")
    if (tag && !note.tags.includes(tag) && note.tags.length < 20) save([...note.tags, tag])
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {note.tags.map((t) => (
        <span key={t} className="inline-flex items-center gap-0.5 rounded-control bg-violet/15 py-0.5 pr-0.5 pl-2 font-medium text-foreground">
          #{t}
          <button type="button" aria-label={`Remove tag ${t}`} onClick={() => save(note.tags.filter((x) => x !== t))} className="grid size-4 place-items-center rounded-full hover:bg-violet/25">
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        list={listId}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === "," || e.key === " ") && draft.trim()) {
            e.preventDefault()
            add()
          }
        }}
        onBlur={() => draft.trim() && add()}
        placeholder="#tag"
        aria-label="Add a tag"
        maxLength={32}
        className="field-sizing-content min-w-12 rounded-control bg-transparent px-1.5 py-0.5 text-foreground outline-none placeholder:text-muted-foreground focus:bg-surface-2/70"
      />
      <datalist id={listId}>
        {suggestions
          .filter((s) => !note.tags.includes(s))
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
    </span>
  )
}

/* ── journal ────────────────────────────────────────── */

const MOOD = ["", "Rough", "Low", "Okay", "Good", "Great"]

/** A journal entry's day: step to the day before or after, and that day's reflection from My Day. */
function JournalBar({ date, today, reflection }: { date: string; today: string; reflection?: Reflection }) {
  const router = useRouter()
  const go = async (day: string) => {
    const entry = await attempt(() => openJournal(day))
    if (entry) openNote(entry.id, (h) => router.push(h))
  }
  return (
    <div className="mb-3 space-y-2">
      <div className="flex items-center gap-1">
        <Button size="icon-sm" variant="ghost" aria-label="The day before" onClick={() => void go(addDays(date, -1))}>
          <ChevronLeft />
        </Button>
        <span className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Journal</span>
        <Button size="icon-sm" variant="ghost" aria-label="The day after" disabled={date >= today} onClick={() => void go(addDays(date, 1))}>
          <ChevronRight />
        </Button>
        {date !== today && (
          <Button size="xs" variant="ghost" onClick={() => void go(today)}>
            Today
          </Button>
        )}
      </div>
      {reflection && (
        <div className="rounded-xl bg-surface-2/60 px-3 py-2 text-xs ring-1 ring-line">
          <span className="font-medium text-foreground">Reflection: {MOOD[reflection.mood]}</span>
          {reflection.wins && <span className="text-muted-foreground"> · Went well: {reflection.wins}</span>}
          {reflection.improve && <span className="text-muted-foreground"> · Next time: {reflection.improve}</span>}
        </div>
      )}
    </div>
  )
}

/* ── formatting bar ─────────────────────────────────── */

function ToolButton({ label, icon: I, active, disabled, onClick }: { label: string; icon: LucideIcon; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      // keeps the editor's selection, so the button acts on what's selected
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "pressable grid size-9 shrink-0 place-items-center rounded-lg transition-colors disabled:opacity-40 sm:size-8",
        active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground",
      )}
    >
      <I className="size-4" />
    </button>
  )
}

const Divider = () => <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-line" />

/** The formatting bar: stays in reach under the top bar while you scroll a long note. */
function Toolbar({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      h1: e.isActive("heading", { level: 1 }),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      task: e.isActive("taskList"),
      quote: e.isActive("blockquote"),
      codeBlock: e.isActive("codeBlock"),
      undo: e.can().undo(),
      redo: e.can().redo(),
    }),
  })
  const run = (fn: (c: ReturnType<Editor["chain"]>) => ReturnType<Editor["chain"]>) => fn(editor.chain().focus()).run()
  const items: (ReactNode | null)[] = [
    <ToolButton key="undo" label="Undo" icon={Undo2} disabled={!s.undo} onClick={() => run((c) => c.undo())} />,
    <ToolButton key="redo" label="Redo" icon={Redo2} disabled={!s.redo} onClick={() => run((c) => c.redo())} />,
    <Divider key="d1" />,
    <ToolButton key="h1" label="Title heading" icon={Heading1} active={s.h1} onClick={() => run((c) => c.toggleHeading({ level: 1 }))} />,
    <ToolButton key="h2" label="Heading" icon={Heading2} active={s.h2} onClick={() => run((c) => c.toggleHeading({ level: 2 }))} />,
    <ToolButton key="h3" label="Subheading" icon={Heading3} active={s.h3} onClick={() => run((c) => c.toggleHeading({ level: 3 }))} />,
    <Divider key="d2" />,
    <ToolButton key="b" label="Bold" icon={Bold} active={s.bold} onClick={() => run((c) => c.toggleBold())} />,
    <ToolButton key="i" label="Italic" icon={Italic} active={s.italic} onClick={() => run((c) => c.toggleItalic())} />,
    <ToolButton key="s" label="Strikethrough" icon={Strikethrough} active={s.strike} onClick={() => run((c) => c.toggleStrike())} />,
    <ToolButton key="c" label="Code" icon={Code} active={s.code} onClick={() => run((c) => c.toggleCode())} />,
    <Divider key="d3" />,
    <ToolButton key="ul" label="Bulleted list" icon={List} active={s.bullet} onClick={() => run((c) => c.toggleBulletList())} />,
    <ToolButton key="ol" label="Numbered list" icon={ListOrdered} active={s.ordered} onClick={() => run((c) => c.toggleOrderedList())} />,
    <ToolButton key="todo" label="Checklist" icon={ListTodo} active={s.task} onClick={() => run((c) => c.toggleTaskList())} />,
    <Divider key="d4" />,
    <ToolButton key="q" label="Quote" icon={TextQuote} active={s.quote} onClick={() => run((c) => c.toggleBlockquote())} />,
    <ToolButton key="cb" label="Code block" icon={SquareCode} active={s.codeBlock} onClick={() => run((c) => c.toggleCodeBlock())} />,
    <ToolButton key="hr" label="Divider line" icon={Minus} onClick={() => run((c) => c.setHorizontalRule())} />,
    <Divider key="d5" />,
    <ToolButton key="link" label="Link to a note ([[)" icon={Brackets} onClick={() => startNoteLink(editor)} />,
  ]
  return (
    <div className="sticky top-[calc(max(0.75rem,env(safe-area-inset-top))+66px)] z-10 mx-3 sm:mx-5">
      <div role="toolbar" aria-label="Formatting" className="no-scrollbar flex items-center gap-0.5 overflow-x-auto rounded-xl bg-popover/95 p-1 shadow-sm ring-1 ring-line">
        {items}
      </div>
    </div>
  )
}

/* ── backlinks ──────────────────────────────────────── */

/** Notes that link here (with the line that does), and ones that name this note without a link yet. */
function Connections({ note, notes }: { note: Note; notes: Note[] }) {
  const router = useRouter()
  const linked = useMemo(() => backlinks(note, notes), [note, notes])
  const mentions = useMemo(() => unlinkedMentions(note, notes).slice(0, 8), [note, notes])
  if (note.kind === "template" || (!linked.length && !mentions.length)) return null
  const open = (id: string) => openNote(id, (h) => router.push(h))
  return (
    <div className="space-y-4 border-t border-line px-5 py-5 sm:px-7">
      {linked.length > 0 && (
        <section>
          <h3 className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">Linked from · {linked.length}</h3>
          <ul className="space-y-1.5">
            {linked.map(({ note: n, context }) => (
              <li key={n.id}>
                <button type="button" onClick={() => open(n.id)} className="pressable w-full rounded-xl bg-surface-2/60 px-3 py-2 text-left ring-1 ring-line [--press-scale:0.99] hover:bg-surface-2">
                  <span className="block truncate text-sm font-medium">{n.title || "Untitled"}</span>
                  {context && <span className="line-clamp-2 text-xs text-muted-foreground">{context}</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {mentions.length > 0 && (
        <section>
          <h3 className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">Mentioned in, not linked</h3>
          <ul className="flex flex-wrap gap-1.5">
            {mentions.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => open(n.id)} className="pressable rounded-full bg-surface-2/70 px-3 py-1 text-xs ring-1 ring-line hover:text-foreground">
                  {n.title || "Untitled"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

