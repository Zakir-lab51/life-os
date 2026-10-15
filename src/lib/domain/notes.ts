import { formatDay } from "./dates"
import type { ID, ISODate, Note, NoteNode } from "./types"

/*
  Note maths. A note's document is the editor's JSON; everything else (its plain text,
  the notes it links to, backlinks, search, folders, the graph) is read from it here,
  with no editor involved, so any screen can use it.
*/

/** The inline node for a link to another note: `{ type: "noteLink", attrs: { id, title } }`. */
export const NOTE_LINK = "noteLink"

export const emptyDoc = (): NoteNode => ({ type: "doc", content: [{ type: "paragraph" }] })

const TEXT_BLOCKS = new Set(["paragraph", "heading", "codeBlock"])

const linkAttrs = (n: NoteNode) => ({ id: (n.attrs?.id as ID | null | undefined) ?? null, title: String(n.attrs?.title ?? "") })

/** Every block of text (paragraphs, headings, code), each as one line of plain text. */
export function textBlocks(doc: NoteNode): { text: string; node: NoteNode }[] {
  const out: { text: string; node: NoteNode }[] = []
  const inline = (n: NoteNode): string => {
    if (n.type === "text") return n.text ?? ""
    if (n.type === NOTE_LINK) return linkAttrs(n).title
    if (n.type === "hardBreak") return " "
    return (n.content ?? []).map(inline).join("")
  }
  const walk = (n: NoteNode) => {
    if (TEXT_BLOCKS.has(n.type)) {
      const text = inline(n).replace(/\s+/g, " ").trim()
      if (text) out.push({ text, node: n })
    } else n.content?.forEach(walk)
  }
  walk(doc)
  return out
}

/** The document as plain text, one line per block; links read as their titles. */
export const docText = (doc: NoteNode) =>
  textBlocks(doc)
    .map((b) => b.text)
    .join("\n")

/** Ids of the notes a document links to, each once. */
export function docLinks(doc: NoteNode): ID[] {
  const ids = new Set<ID>()
  const walk = (n: NoteNode) => {
    if (n.type === NOTE_LINK) {
      const { id } = linkAttrs(n)
      if (id) ids.add(id)
    }
    n.content?.forEach(walk)
  }
  walk(doc)
  return [...ids]
}

/** A copy of the document with `fn` applied to every note link's attributes (the same object back when nothing changed). */
export function mapLinks(doc: NoteNode, fn: (attrs: { id: ID | null; title: string }) => { id: ID | null; title: string }): NoteNode {
  const walk = (n: NoteNode): NoteNode => {
    if (n.type === NOTE_LINK) {
      const before = linkAttrs(n)
      const after = fn(before)
      return after.id === before.id && after.title === before.title ? n : { ...n, attrs: { ...n.attrs, ...after } }
    }
    if (!n.content) return n
    const content = n.content.map(walk)
    return content.every((c, i) => c === n.content![i]) ? n : { ...n, content }
  }
  return walk(doc)
}

/** Links to `id` show its new title. */
export const renameLinks = (doc: NoteNode, id: ID, title: string) => mapLinks(doc, (a) => (a.id === id ? { ...a, title } : a))

/** Links typed as [[Title]] (in imported Markdown) find the note with that title. */
export const resolveLinks = (doc: NoteNode, find: (title: string) => ID | null) => mapLinks(doc, (a) => (a.id ? a : { ...a, id: find(a.title) }))

/** The line around the first link to `id`: how one note mentions another. */
export function linkContext(doc: NoteNode, id: ID): string | null {
  const has = (n: NoteNode): boolean => (n.type === NOTE_LINK && linkAttrs(n).id === id) || !!n.content?.some(has)
  return textBlocks(doc).find((b) => has(b.node))?.text ?? null
}

/** Notes that link to this one, each with the line that mentions it. */
export function backlinks(note: Pick<Note, "id">, notes: Note[]): { note: Note; context: string }[] {
  return notes
    .filter((n) => n.id !== note.id && n.links.includes(note.id))
    .map((n) => ({ note: n, context: linkContext(n.content, note.id) ?? "" }))
    .sort((a, b) => b.note.updatedAt.localeCompare(a.note.updatedAt))
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** Notes that name this one in their text without linking to it. */
export function unlinkedMentions(note: Pick<Note, "id" | "title">, notes: Note[]): Note[] {
  const title = note.title.trim()
  if (title.length < 3) return []
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(title)}($|[^\\p{L}\\p{N}])`, "iu")
  return notes.filter((n) => n.id !== note.id && n.kind !== "template" && !n.links.includes(note.id) && re.test(n.text))
}

/** About `length` characters of `text` around the first match of `query`, or its start. */
export function snippet(text: string, query = "", length = 120): string {
  const flat = text.replace(/\s+/g, " ").trim()
  const word = query.trim().toLowerCase().split(/\s+/)[0]
  const at = word ? flat.toLowerCase().indexOf(word) : -1
  if (at < 0 || flat.length <= length) return flat.length > length ? `${flat.slice(0, length).trimEnd()}…` : flat
  const start = Math.max(0, at - Math.floor(length / 3))
  const end = Math.min(flat.length, start + length)
  return `${start > 0 ? "…" : ""}${flat.slice(start, end).trim()}${end < flat.length ? "…" : ""}`
}

export interface NoteHit {
  note: Note
  snippet: string
}

/**
 * Full-text search: every word has to appear in the title, text, folder or tags. Title
 * matches rank first (a title starting with the query, highest), then the most recently edited.
 */
export function searchNotes(notes: Note[], query: string): NoteHit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return notes.map((note) => ({ note, snippet: snippet(note.text) }))
  const hits: { hit: NoteHit; score: number }[] = []
  for (const note of notes) {
    const title = note.title.toLowerCase()
    const hay = `${title}\n${note.text.toLowerCase()}\n${(note.folder ?? "").toLowerCase()}\n${note.tags.join(" ")}`
    if (!words.every((w) => hay.includes(w))) continue
    let score = words.filter((w) => title.includes(w)).length * 3
    if (title.startsWith(words[0])) score += 5
    score += words.filter((w) => note.tags.some((t) => t.startsWith(w))).length * 2
    hits.push({ hit: { note, snippet: snippet(note.text, query) }, score })
  }
  return hits.sort((a, b) => b.score - a.score || b.hit.note.updatedAt.localeCompare(a.hit.note.updatedAt)).map((h) => h.hit)
}

export interface FolderEntry {
  path: string
  name: string
  depth: number
  /** Notes in this folder and the ones inside it. */
  count: number
}

/** Folder paths ("Med school/Physiology") as a sorted tree, parents included, with note counts. */
export function folderList(notes: Note[]): FolderEntry[] {
  const counts = new Map<string, number>()
  for (const n of notes) {
    if (!n.folder) continue
    const parts = n.folder.split("/").filter(Boolean)
    for (let i = 1; i <= parts.length; i++) {
      const path = parts.slice(0, i).join("/")
      counts.set(path, (counts.get(path) ?? 0) + 1)
    }
  }
  return [...counts]
    .sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: "base" }))
    .map(([path, count]) => {
      const parts = path.split("/")
      return { path, name: parts[parts.length - 1], depth: parts.length - 1, count }
    })
}

/** "Physiology / Renal" → "Physiology/Renal"; blank → null. */
export function cleanFolder(raw: string | null | undefined): string | null {
  const path = (raw ?? "")
    .split("/")
    .map((p) => p.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .join("/")
    .slice(0, 120)
  return path || null
}

export const inFolder = (note: Pick<Note, "folder">, path: string) => note.folder === path || !!note.folder?.startsWith(`${path}/`)

export function tagList(notes: Note[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const n of notes) for (const t of n.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
  return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

/* ── journal ────────────────────────────────────────── */

/** One journal entry per day, on every device: its id is the day. */
export const journalId = (date: ISODate) => `journal:${date}`
export const journalTitle = (date: ISODate) => formatDay(date, "EEEE, d MMMM yyyy")

/* ── templates ──────────────────────────────────────── */

const text = (t: string): NoteNode[] => (t ? [{ type: "text", text: t }] : [])
const h = (level: number, t: string): NoteNode => ({ type: "heading", attrs: { level }, content: text(t) })
const p = (t = ""): NoteNode => ({ type: "paragraph", content: text(t) })
const bullets = (items: string[]): NoteNode => ({ type: "bulletList", content: items.map((t) => ({ type: "listItem", content: [p(t)] })) })
const tasks = (items: string[]): NoteNode => ({ type: "taskList", content: items.map((t) => ({ type: "taskItem", attrs: { checked: false }, content: [p(t)] })) })
const doc = (...content: NoteNode[]): NoteNode => ({ type: "doc", content })

export interface NoteTemplate {
  id: string
  name: string
  description: string
  /** The new note's title (blank for the user to fill in). */
  title: (today: ISODate) => string
  content: () => NoteNode
}

/** A day's journal entry starts like this. */
export const journalTemplate = () => doc(h(2, "Today's focus"), p(), h(2, "Grateful for"), bullets([""]), h(2, "Notes"), p(), h(2, "What I learned"), p())

export const BUILT_IN_TEMPLATES: NoteTemplate[] = [
  { id: "lecture", name: "Lecture notes", description: "Key points, questions, what to revise", title: (d) => `Lecture · ${formatDay(d, "d MMM")}`, content: () => doc(h(2, "Key points"), bullets([""]), h(2, "Questions"), tasks([""]), h(2, "To revise"), tasks([""])) },
  { id: "case", name: "Clinical case", description: "Presentation to learning points (keep it anonymous)", title: () => "Case: ", content: () => doc(h(2, "Presentation"), p(), h(2, "History"), p(), h(2, "Examination"), p(), h(2, "Investigations"), p(), h(2, "Differentials"), bullets([""]), h(2, "Learning points"), bullets([""])) },
  { id: "meeting", name: "Meeting", description: "Who, agenda, notes and actions", title: (d) => `Meeting · ${formatDay(d, "d MMM")}`, content: () => doc(p("Who: "), h(2, "Agenda"), bullets([""]), h(2, "Notes"), p(), h(2, "Actions"), tasks([""])) },
  { id: "book", name: "Book notes", description: "Big ideas, quotes and what you'll change", title: () => "", content: () => doc(p("Author: "), h(2, "Big ideas"), bullets([""]), h(2, "Quotes"), { type: "blockquote", content: [p()] }, h(2, "What I'll do differently"), tasks([""])) },
  { id: "brief", name: "Project brief", description: "Why, what done looks like, steps, resources", title: () => "", content: () => doc(h(2, "Why"), p(), h(2, "What done looks like"), p(), h(2, "Steps"), tasks([""]), h(2, "Resources"), bullets([""])) },
]

/* ── graph ──────────────────────────────────────────── */

export interface GraphNode {
  id: ID
  title: string
  folder: string | null
  degree: number
  x: number
  y: number
}

export interface GraphEdge {
  a: ID
  b: ID
}

/** Notes (not templates) and the links between them, each pair once; links to deleted notes are left out. */
export function noteGraph(notes: Note[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const shown = notes.filter((n) => n.kind !== "template")
  const ids = new Set(shown.map((n) => n.id))
  const seen = new Set<string>()
  const edges: GraphEdge[] = []
  const degree = new Map<ID, number>()
  for (const n of shown) {
    for (const to of n.links) {
      if (to === n.id || !ids.has(to)) continue
      const key = n.id < to ? `${n.id} ${to}` : `${to} ${n.id}`
      if (seen.has(key)) continue
      seen.add(key)
      edges.push({ a: n.id, b: to })
      degree.set(n.id, (degree.get(n.id) ?? 0) + 1)
      degree.set(to, (degree.get(to) ?? 0) + 1)
    }
  }
  return { nodes: shown.map((n) => ({ id: n.id, title: n.title || "Untitled", folder: n.folder, degree: degree.get(n.id) ?? 0, x: 0, y: 0 })), edges }
}

/**
 * Places the graph with a force layout (Fruchterman–Reingold, plus a pull towards the
 * middle so unlinked notes don't drift off). Deterministic: the same notes always land in
 * the same places. Coordinates fall inside `width` × `height`, `pad` in from the edges.
 */
export function layoutGraph(nodes: GraphNode[], edges: GraphEdge[], { width, height, pad = 24, iterations = 300 }: { width: number; height: number; pad?: number; iterations?: number }): GraphNode[] {
  const n = nodes.length
  if (!n) return []
  const index = new Map(nodes.map((node, i) => [node.id, i]))
  const area = width * height
  const k = Math.sqrt(area / n) * 0.75
  // a sunflower spiral to start from: even, and no randomness
  const xs = nodes.map((_, i) => Math.sqrt(i + 0.5) * Math.cos(i * 2.39996) * k * 0.5)
  const ys = nodes.map((_, i) => Math.sqrt(i + 0.5) * Math.sin(i * 2.39996) * k * 0.5)
  const links = edges.map((e) => [index.get(e.a)!, index.get(e.b)!] as const).filter(([a, b]) => a !== undefined && b !== undefined)
  let t = Math.max(width, height) / 8
  for (let step = 0; step < iterations; step++) {
    const dx = new Float64Array(n)
    const dy = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let x = xs[i] - xs[j]
        let y = ys[i] - ys[j]
        let d = Math.hypot(x, y)
        if (d < 0.01) {
          x = 0.01 * (i - j)
          y = 0.01
          d = Math.hypot(x, y)
        }
        const f = (k * k) / d
        dx[i] += (x / d) * f
        dy[i] += (y / d) * f
        dx[j] -= (x / d) * f
        dy[j] -= (y / d) * f
      }
    }
    for (const [a, b] of links) {
      const x = xs[a] - xs[b]
      const y = ys[a] - ys[b]
      const d = Math.max(0.01, Math.hypot(x, y))
      const f = (d * d) / k
      dx[a] -= (x / d) * f
      dy[a] -= (y / d) * f
      dx[b] += (x / d) * f
      dy[b] += (y / d) * f
    }
    for (let i = 0; i < n; i++) {
      dx[i] -= xs[i] * 0.05 * (k / 10)
      dy[i] -= ys[i] * 0.05 * (k / 10)
      const d = Math.max(0.01, Math.hypot(dx[i], dy[i]))
      xs[i] += (dx[i] / d) * Math.min(d, t)
      ys[i] += (dy[i] / d) * Math.min(d, t)
    }
    t = Math.max(0.5, t * 0.97)
  }
  // fit inside the box, keeping the aspect ratio
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const scale = Math.min((width - pad * 2) / Math.max(1, maxX - minX), (height - pad * 2) / Math.max(1, maxY - minY))
  const offX = (width - (maxX - minX) * scale) / 2
  const offY = (height - (maxY - minY) * scale) / 2
  return nodes.map((node, i) => ({ ...node, x: offX + (xs[i] - minX) * scale, y: offY + (ys[i] - minY) * scale }))
}
