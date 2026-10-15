import type { Extensions } from "@tiptap/core"
import { TaskItem, TaskList } from "@tiptap/extension-list"
import { Placeholder } from "@tiptap/extensions"
import StarterKit from "@tiptap/starter-kit"
import { NoteLink, type NoteLinkOptions } from "./note-link"

/** Web and mail links only: a pasted javascript: or data: link never becomes clickable. */
const SAFE = /^(https?:|mailto:)/i

/**
 * What a note can hold: headings, bold/italic/strike/code, lists and checklists, quotes,
 * code blocks, dividers, web links and links to other notes. The editor, Markdown import
 * and export all use this one list, so they always agree.
 */
export function noteExtensions(links?: NoteLinkOptions): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: {
        openOnClick: true,
        autolink: true,
        defaultProtocol: "https",
        protocols: ["http", "https", "mailto"],
        isAllowedUri: (url, ctx) => SAFE.test(url) || (!/^[a-z][a-z0-9+.-]*:/i.test(url) && ctx.defaultValidate(`https://${url}`)),
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
      },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({
      placeholder: ({ node }) => (node.type.name === "heading" ? "Heading" : "Write here. Type [[ to link another note."),
    }),
    links ? NoteLink.configure(links) : NoteLink,
  ]
}
