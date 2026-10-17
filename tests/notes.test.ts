import { beforeEach, describe, expect, it } from "vitest"
import { db } from "@/lib/db/db"
import { exportBackup, restoreBackup } from "@/lib/db/backup"
import { parseBackup } from "@/lib/db/backup-file"
import { removeDemo, seedDemo } from "@/lib/db/demo"
import { ValidationError, captureIdea, createNote, deleteNote, importNotes, openJournal, restoreNote, updateNote, wipeAllData } from "@/lib/db/repo"
import {
  BUILT_IN_TEMPLATES,
  backlinks,
  cleanFolder,
  docLinks,
  docText,
  folderList,
  journalId,
  journalTemplate,
  layoutGraph,
  linkContext,
  noteGraph,
  renameLinks,
  resolveLinks,
  searchNotes,
  snippet,
  unlinkedMentions,
} from "@/lib/domain/notes"
import type { Note, NoteNode } from "@/lib/domain/types"

const t = (text: string, marks?: NoteNode["marks"]): NoteNode => ({ type: "text", text, ...(marks ? { marks } : {}) })
const link = (id: string | null, title: string): NoteNode => ({ type: "noteLink", attrs: { id, title } })
const p = (...content: NoteNode[]): NoteNode => ({ type: "paragraph", content })
const doc = (...content: NoteNode[]): NoteNode => ({ type: "doc", content })

let n = 0
const note = (o: Partial<Note> = {}): Note => {
  const content = o.content ?? doc(p(t(o.text ?? "")))
  return {
    id: `n${++n}`,
    title: "Note",
    tags: [],
    folder: null,
    kind: "note",
    date: null,
    inbox: false,
    pinned: false,
    createdAt: "2026-03-01T09:00:00.000Z",
    updatedAt: "2026-03-01T09:00:00.000Z",
    ...o,
    content,
    text: o.text ?? docText(content),
    links: o.links ?? docLinks(content),
  }
}

describe("reading a note's document", () => {
  const sample = doc(
    { type: "heading", attrs: { level: 1 }, content: [t("Cardiac cycle")] },
    p(t("Systole "), t("then", [{ type: "bold" }]), t(" diastole. See "), link("ecg", "ECG basics"), t(".")),
    { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [p(t("Wiggers diagram"))] }] },
    p(link("ecg", "ECG basics"), t(" and "), link("heart", "Heart sounds")),
  )

  it("reads plain text, one line per block, links as their titles", () => {
    expect(docText(sample)).toBe("Cardiac cycle\nSystole then diastole. See ECG basics.\nWiggers diagram\nECG basics and Heart sounds")
  })

  it("lists each linked note once, and the line that mentions it", () => {
    expect(docLinks(sample)).toEqual(["ecg", "heart"])
    expect(linkContext(sample, "heart")).toBe("ECG basics and Heart sounds")
    expect(linkContext(sample, "nope")).toBeNull()
  })

  it("renames links to a note, keeping the document when nothing changes", () => {
    const renamed = renameLinks(sample, "ecg", "ECG: the basics")
    expect(docText(renamed)).toContain("See ECG: the basics.")
    expect(renameLinks(sample, "other", "X")).toBe(sample)
  })

  it("finds imported [[links]] by title", () => {
    const imported = doc(p(link(null, "ECG basics"), link(null, "Unknown")))
    const resolved = resolveLinks(imported, (title) => (title === "ECG basics" ? "ecg" : null))
    expect(docLinks(resolved)).toEqual(["ecg"])
  })
})

describe("finding notes", () => {
  it("searches every word across title, text, folder and tags; title matches first", () => {
    const a = note({ title: "Renal physiology", text: "Nephron and loop of Henle", updatedAt: "2026-03-01T09:00:00.000Z" })
    const b = note({ title: "Seminar", text: "Renal clearance and the nephron", updatedAt: "2026-03-05T09:00:00.000Z" })
    const c = note({ title: "Gym", text: "Leg day", tags: ["renal"] })
    expect(searchNotes([a, b, c], "renal").map((h) => h.note.id)).toEqual([a.id, c.id, b.id])
    expect(searchNotes([a, b, c], "renal nephron").map((h) => h.note.id)).toEqual([a.id, b.id])
    expect(searchNotes([a, b, c], "henle")[0].snippet).toContain("Henle")
  })

  it("cuts a snippet around the match", () => {
    const long = `${"word ".repeat(60)}target ${"tail ".repeat(60)}`
    const s = snippet(long, "target", 60)
    expect(s).toContain("target")
    expect(s.startsWith("…")).toBe(true)
    expect(s.length).toBeLessThanOrEqual(62)
  })

  it("builds the folder tree with counts, and tidies folder names", () => {
    const notes = [note({ folder: "Med school/Physiology" }), note({ folder: "Med school/Anatomy" }), note({ folder: "Med school/Physiology" }), note({ folder: "Personal" }), note()]
    expect(folderList(notes)).toEqual([
      { path: "Med school", name: "Med school", depth: 0, count: 3 },
      { path: "Med school/Anatomy", name: "Anatomy", depth: 1, count: 1 },
      { path: "Med school/Physiology", name: "Physiology", depth: 1, count: 2 },
      { path: "Personal", name: "Personal", depth: 0, count: 1 },
    ])
    expect(cleanFolder("  Med  school / Physiology/ ")).toBe("Med school/Physiology")
    expect(cleanFolder("  ")).toBeNull()
  })

  it("finds backlinks with their context, and mentions that aren't links yet", () => {
    const ecg = note({ id: "ecg", title: "ECG basics" })
    const linker = note({ content: doc(p(t("Read "), link("ecg", "ECG basics"), t(" first"))) })
    const mention = note({ text: "Revise ecg basics before the viva" })
    const partial = note({ text: "ECG basicsX is not a mention" })
    expect(backlinks(ecg, [ecg, linker, mention])).toEqual([{ note: linker, context: "Read ECG basics first" }])
    expect(unlinkedMentions(ecg, [ecg, linker, mention, partial]).map((x) => x.id)).toEqual([mention.id])
  })
})

describe("templates and the graph", () => {
  it("every built-in template and the journal start as a document", () => {
    for (const tpl of BUILT_IN_TEMPLATES) expect(tpl.content().type).toBe("doc")
    expect(docText(journalTemplate())).toContain("Today's focus")
  })

  it("links each pair once, ignores templates and missing notes, and lays nodes out inside the box", () => {
    const a = note({ id: "a", links: ["b", "gone"] })
    const b = note({ id: "b", links: ["a"] })
    const c = note({ id: "c" })
    const tpl = note({ id: "t", kind: "template", links: ["a"] })
    const graph = noteGraph([a, b, c, tpl])
    expect(graph.edges).toEqual([{ a: "a", b: "b" }])
    expect(graph.nodes.map((x) => [x.id, x.degree])).toEqual([["a", 1], ["b", 1], ["c", 0]])
    const placed = layoutGraph(graph.nodes, graph.edges, { width: 400, height: 300, pad: 20 })
    for (const node of placed) {
      expect(node.x).toBeGreaterThanOrEqual(19.9)
      expect(node.x).toBeLessThanOrEqual(380.1)
      expect(node.y).toBeGreaterThanOrEqual(19.9)
      expect(node.y).toBeLessThanOrEqual(280.1)
    }
    const at = new Map(placed.map((x) => [x.id, x]))
    const dist = (p1: string, p2: string) => Math.hypot(at.get(p1)!.x - at.get(p2)!.x, at.get(p1)!.y - at.get(p2)!.y)
    expect(dist("a", "b")).toBeLessThan(dist("a", "c"))
    expect(layoutGraph(graph.nodes, graph.edges, { width: 400, height: 300 })).toEqual(layoutGraph(graph.nodes, graph.edges, { width: 400, height: 300 }))
  })
})

describe("note storage", () => {
  beforeEach(async () => {
    await wipeAllData()
  })

  it("saves a note with its text and links read from the document, and tidies tags and folder", async () => {
    const made = await createNote({ title: "Cardiac cycle", content: doc(p(t("See "), link("x", "ECG"))), tags: ["#Exam", "exam"], folder: " Physiology / " })
    expect(made).toMatchObject({ text: "See ECG", links: ["x"], tags: ["exam"], folder: "Physiology", kind: "note", inbox: false })
    const blank = await createNote({})
    expect(blank.content).toEqual({ type: "doc", content: [{ type: "paragraph" }] })
    await expect(createNote({ content: { type: "paragraph" } })).rejects.toBeInstanceOf(ValidationError)
  })

  it("writes a new title into every link to the note", async () => {
    const ecg = await createNote({ title: "ECG basics" })
    const linker = await createNote({ title: "Cardiac", content: doc(p(t("Read "), link(ecg.id, "ECG basics"))) })
    await updateNote(ecg.id, { title: "ECG: the basics" })
    const after = await db.notes.get(linker.id)
    expect(after?.text).toBe("Read ECG: the basics")
    expect(after?.updatedAt).toBe(linker.updatedAt)
  })

  it("keeps one journal entry per day, from the journal template", async () => {
    const first = await openJournal("2026-03-10")
    const again = await openJournal("2026-03-10")
    expect(first.id).toBe(journalId("2026-03-10"))
    expect(again.createdAt).toBe(first.createdAt)
    expect(first).toMatchObject({ kind: "journal", date: "2026-03-10", title: "Tuesday, 10 March 2026" })
    expect(await db.notes.count()).toBe(1)
  })

  it("captures an idea to the inbox: first line the title, the rest the body", async () => {
    const idea = await captureIdea("  Flashcards from the renal seminar\nUse the slides\n\nAsk Riya  ")
    expect(idea).toMatchObject({ title: "Flashcards from the renal seminar", text: "Use the slides\nAsk Riya", inbox: true })
    await expect(captureIdea("   ")).rejects.toThrow("Write the idea first")
  })

  it("deletes with undo", async () => {
    const made = await createNote({ title: "Temp" })
    const snapshot = await deleteNote(made.id)
    expect(await db.notes.count()).toBe(0)
    await restoreNote(snapshot)
    expect((await db.notes.get(made.id))?.title).toBe("Temp")
  })

  it("imports notes, linking [[titles]] to each other and to notes already here", async () => {
    const existing = await createNote({ title: "ECG basics" })
    const [a, b] = await importNotes([
      { title: "Cardiac cycle", content: doc(p(link(null, "heart sounds"), t(" "), link(null, "ECG Basics"), t(" "), link(null, "Nowhere"))) },
      { title: "Heart sounds", content: doc(p(t("S1, S2"))), folder: "Physiology", tags: ["exam"] },
    ])
    expect(a.links).toEqual([b.id, existing.id])
    expect(b).toMatchObject({ folder: "Physiology", tags: ["exam"], text: "S1, S2" })
  })

  it("survives a backup round trip, and older backups without notes still restore", async () => {
    const made = await createNote({ title: "Keep me", content: doc(p(t("Body"))), pinned: true })
    const text = JSON.stringify(await exportBackup())
    await wipeAllData()
    await restoreBackup(parseBackup(text))
    expect(await db.notes.get(made.id)).toMatchObject({ title: "Keep me", text: "Body", pinned: true })
    const old = JSON.parse(text)
    delete old.data.notes
    expect(parseBackup(JSON.stringify(old)).data.notes).toEqual([])
  })

  it("the demo brings linked notes and a journal, and removing it takes them away", async () => {
    await seedDemo()
    const notes = await db.notes.toArray()
    expect(notes.some((x) => x.kind === "journal")).toBe(true)
    expect(notes.some((x) => x.links.length > 0)).toBe(true)
    const mine = await createNote({ title: "Mine" })
    await removeDemo()
    expect((await db.notes.toArray()).map((x) => x.id)).toEqual([mine.id])
  })
})
