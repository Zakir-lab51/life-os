// @vitest-environment happy-dom
import { describe, expect, it } from "vitest"
import { docLinks, docText } from "@/lib/domain/notes"
import type { Note } from "@/lib/domain/types"
import { crc32, zip } from "@/lib/zip"
import { fileName, markdownToDraft, noteToMarkdown, notesZip } from "@/features/notes/markdown"

const sample = `---
tags: [exam, "ecg"]
folder: Med school/Physiology
---

# Cardiac cycle

Walk through **one beat** on the *Wiggers diagram*. See [[ECG basics]] and [[Heart sounds]].

## Checklist

- [x] Wiggers diagram
- [ ] Pressure–volume loop

1. Atrial systole
2. Ejection

> S3 is normal in athletes #physio
`

describe("Markdown import", () => {
  it("reads front matter, the # title, hashtags, links, checklists and lists", () => {
    const d = markdownToDraft("whatever.md", sample)
    expect(d.title).toBe("Cardiac cycle")
    expect(d.folder).toBe("Med school/Physiology")
    expect(d.tags).toEqual(["exam", "ecg", "physio"])
    const text = docText(d.content)
    expect(text).toContain("Walk through one beat on the Wiggers diagram. See ECG basics and Heart sounds.")
    expect(text.split("\n")).toContain("Pressure–volume loop")
    const types = JSON.stringify(d.content)
    for (const t of ['"taskList"', '"taskItem"', '"orderedList"', '"blockquote"', '"bold"', '"italic"', '"noteLink"']) expect(types).toContain(t)
    // links stay unresolved until the import matches titles
    expect(docLinks(d.content)).toEqual([])
  })

  it("falls back to the file name, and to the zip folder, and never leaves a note empty", () => {
    const d = markdownToDraft("Notes/Renal clearance.md", "", "Physiology")
    expect(d).toMatchObject({ title: "Renal clearance", folder: "Physiology", tags: [] })
    expect(d.content.content?.length).toBeGreaterThan(0)
    expect(markdownToDraft("x.txt", "---\ntitle: From front matter\ntags:\n  - a\n  - b\n---\nBody").title).toBe("From front matter")
    expect(markdownToDraft("x.txt", "---\ntitle: From front matter\ntags:\n  - a\n  - b\n---\nBody").tags).toEqual(["a", "b"])
  })
})

describe("Markdown export", () => {
  it("writes front matter, the title and the body, and reads back the same", () => {
    const draft = markdownToDraft("x.md", sample)
    const note: Note = { id: "n1", title: draft.title, content: draft.content, text: docText(draft.content), links: [], tags: draft.tags ?? [], folder: draft.folder ?? null, kind: "note", date: null, inbox: false, pinned: false, createdAt: "2026-03-01T09:00:00.000Z", updatedAt: "2026-03-01T09:00:00.000Z" }
    const out = noteToMarkdown(note)
    expect(out.startsWith("---\ntags: [exam, ecg, physio]\nfolder: Med school/Physiology\ncreated: 2026-03-01\n---\n\n# Cardiac cycle\n")).toBe(true)
    expect(out).toContain("[[ECG basics]]")
    expect(out).toContain("- [x] Wiggers diagram")
    expect(out).toContain("**one beat**")
    const again = markdownToDraft("x.md", out)
    expect(docText(again.content)).toBe(docText(draft.content))
    expect(again.tags).toEqual(draft.tags)
  })

  it("names files safely and keeps folders in the zip", () => {
    expect(fileName('Q: what / why? "really"')).toBe("Q- what - why- -really-")
    expect(fileName("   ")).toBe("Untitled")
    const base = { content: { type: "doc", content: [{ type: "paragraph" }] }, text: "", links: [], tags: [], inbox: false, pinned: false, createdAt: "2026-03-01T09:00:00.000Z", updatedAt: "2026-03-01T09:00:00.000Z" }
    const bytes = notesZip([
      { ...base, id: "a", title: "Same", folder: "Physiology", kind: "note", date: null },
      { ...base, id: "b", title: "Same", folder: "Physiology", kind: "note", date: null },
      { ...base, id: "c", title: "Tuesday", folder: null, kind: "journal", date: "2026-03-10" },
    ] as Note[])
    const names = new TextDecoder().decode(bytes)
    for (const n of ["Physiology/Same.md", "Physiology/Same (2).md", "Journal/2026-03-10.md"]) expect(names).toContain(n)
  })
})

describe("zip", () => {
  it("computes CRC-32 and writes valid headers", () => {
    expect(crc32(new TextEncoder().encode("hello"))).toBe(0x3610a686)
    const bytes = zip([{ name: "a.md", text: "hello" }])
    const view = new DataView(bytes.buffer)
    expect(view.getUint32(0, true)).toBe(0x04034b50)
    expect(view.getUint32(14, true)).toBe(0x3610a686)
    const end = bytes.length - 22
    expect(view.getUint32(end, true)).toBe(0x06054b50)
    expect(view.getUint16(end + 10, true)).toBe(1)
    expect(view.getUint32(end + 16, true)).toBe(30 + 4 + 5)
  })
})
