import { resolveExtensions } from "@tiptap/core"
import { MarkdownManager } from "@tiptap/markdown"
import type { NoteDraft } from "@/lib/db/repo"
import { toISODate } from "@/lib/domain/dates"
import { cleanFolder } from "@/lib/domain/notes"
import { normalizeTag } from "@/lib/domain/tasks"
import type { Note, NoteNode } from "@/lib/domain/types"
import { zip } from "@/lib/zip"
import { noteExtensions } from "./extensions"

/*
  Notes in and out as Markdown, the way Obsidian and most note apps write it: optional
  front matter (tags, folder), a "# Title" line, then the body, with links to other notes
  written [[Title]]. Converting goes through the same extensions as the editor.
*/

let manager: MarkdownManager | null = null
const md = () => (manager ??= new MarkdownManager({ extensions: resolveExtensions(noteExtensions()) }))

/** YAML needs quotes around values with these in them. */
const yaml = (s: string) => (/^[\s"'#&*!|>%@`-]|[:#,[\]{}]|\s$/.test(s) ? JSON.stringify(s) : s)

export function noteToMarkdown(note: Note): string {
  const front = [
    note.tags.length ? `tags: [${note.tags.map(yaml).join(", ")}]` : null,
    note.folder ? `folder: ${yaml(note.folder)}` : null,
    note.date ? `date: ${note.date}` : null,
    `created: ${toISODate(new Date(note.createdAt))}`,
  ].filter(Boolean)
  const body = md().serialize(note.content).trim()
  return `---\n${front.join("\n")}\n---\n\n# ${note.title || "Untitled"}\n${body ? `\n${body}\n` : ""}`
}

const unquote = (s: string) => {
  const t = s.trim()
  if (/^".*"$/.test(t)) {
    try {
      return String(JSON.parse(t))
    } catch {
      return t.slice(1, -1)
    }
  }
  return /^'.*'$/.test(t) ? t.slice(1, -1).replace(/''/g, "'") : t
}

/** The few front-matter keys LIFE OS uses: title, tags (a [list], "a, b", or "- item" lines) and folder. */
function readFrontMatter(block: string) {
  const out: { title?: string; folder?: string; tags: string[] } = { tags: [] }
  const lines = block.split("\n")
  for (let i = 0; i < lines.length; i++) {
    const m = /^([A-Za-z_]+):\s*(.*)$/.exec(lines[i])
    if (!m) continue
    const [, key, value] = m
    if (key === "title") out.title = unquote(value)
    if (key === "folder") out.folder = unquote(value)
    if (key === "tags" || key === "tag") {
      if (value.trim()) out.tags.push(...value.replace(/^\[|\]$/g, "").split(",").map(unquote))
      else while (/^\s*-\s+/.test(lines[i + 1] ?? "")) out.tags.push(unquote(lines[++i].replace(/^\s*-\s+/, "")))
    }
  }
  return out
}

/**
 * Reads one Markdown file into a note: the title from front matter, else a leading "# Title",
 * else the file name; tags from front matter and #hashtags in the text; the folder from front
 * matter, else the file's folder inside an imported zip or folder.
 */
export function markdownToDraft(fileName: string, raw: string, folderFromPath: string | null = null): NoteDraft {
  let text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n")
  let front: ReturnType<typeof readFrontMatter> = { tags: [] }
  const fm = /^---\n([\s\S]*?)\n---[ \t]*(\n|$)/.exec(text)
  if (fm) {
    front = readFrontMatter(fm[1])
    text = text.slice(fm[0].length)
  }
  let title = front.title ?? null
  const h1 = /^\s*#[ \t]+(.+?)[ \t]*#*[ \t]*(\n|$)/.exec(text)
  if (h1 && (!title || h1[1].trim() === title)) {
    title ??= h1[1].trim()
    text = text.slice(h1[0].length)
  }
  title ??= fileName.replace(/^.*[\\/]/, "").replace(/\.(md|markdown|txt)$/i, "")
  const hashtags = [...text.matchAll(/(?:^|\s)#([\p{L}\p{N}_-]+)/gu)].map((m) => m[1])
  const tags = [...new Set([...front.tags, ...hashtags].map(normalizeTag).filter(Boolean))].slice(0, 20)
  const parsed = md().parse(text.trim())
  const content: NoteNode = parsed.type === "doc" ? (parsed as NoteNode) : { type: "doc", content: [parsed as NoteNode] }
  if (!content.content?.length) content.content = [{ type: "paragraph" }]
  return { title: title.slice(0, 200), content, tags, folder: cleanFolder(front.folder ?? folderFromPath) }
}

/** A title as a file name: no characters file systems refuse, not too long. */
export function fileName(title: string) {
  const safe = title
    .replace(/[\\/:*?"<>|#^[\]]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
    .replace(/[. ]+$/, "")
  return safe || "Untitled"
}

/** Every note as a .md file in its folder (journal entries in Journal/, templates in Templates/), zipped. */
export function notesZip(notes: Note[]): Uint8Array {
  const taken = new Set<string>()
  const files = notes.map((n) => {
    const dir = n.kind === "journal" ? "Journal" : n.kind === "template" ? "Templates" : (n.folder ?? "")
    const base = n.kind === "journal" && n.date ? n.date : fileName(n.title)
    let path = `${dir ? `${dir.split("/").map(fileName).join("/")}/` : ""}${base}.md`
    for (let i = 2; taken.has(path.toLowerCase()); i++) path = `${dir ? `${dir}/` : ""}${base} (${i}).md`
    taken.add(path.toLowerCase())
    return { name: path, text: noteToMarkdown(n) }
  })
  return zip(files)
}
