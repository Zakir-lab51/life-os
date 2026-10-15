"use client"

import { Node, mergeAttributes, type Editor } from "@tiptap/core"
import { PluginKey } from "@tiptap/pm/state"
import { NodeViewWrapper, ReactNodeViewRenderer, ReactRenderer, type NodeViewProps } from "@tiptap/react"
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion"
import { FileText, Plus } from "lucide-react"
import { NOTE_LINK } from "@/lib/domain/notes"
import { cn } from "@/lib/utils"
import { useNoteTitle } from "./note-index"

/*
  Links between notes. Typing [[ opens a list of notes to link to (or makes a new one with
  what you typed); the link is an inline chip that shows the note's current title and opens
  it when tapped. In Markdown it's written [[Title]], as in Obsidian.
*/

export interface LinkTarget {
  id: string
  title: string
  folder: string | null
}

export interface NoteLinkOptions {
  /** Notes to offer for what's typed after [[. */
  find: (query: string) => LinkTarget[]
  /** Makes a note with this title (with `id` when given) and returns its id. */
  create: (title: string, id?: string) => string
  /** Opens a linked note. */
  open: (id: string) => void
}

type Item = { kind: "note"; target: LinkTarget } | { kind: "create"; title: string }

export const NoteLink = Node.create<NoteLinkOptions>({
  name: NOTE_LINK,
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return { find: () => [], create: () => "", open: () => undefined }
  },

  addAttributes() {
    return {
      id: { default: null, parseHTML: (el) => el.getAttribute("data-id"), renderHTML: (a) => (a.id ? { "data-id": a.id } : {}) },
      title: { default: "", parseHTML: (el) => el.textContent ?? "", renderHTML: () => ({}) },
    }
  },

  parseHTML() {
    return [{ tag: "span[data-note-link]" }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ["span", mergeAttributes({ "data-note-link": "", class: "note-link" }, HTMLAttributes), node.attrs.title || "Untitled"]
  },

  renderText({ node }) {
    return `[[${node.attrs.title}]]`
  },

  markdownTokenizer: {
    name: NOTE_LINK,
    level: "inline",
    start: (src) => src.indexOf("[["),
    tokenize(src) {
      const m = /^\[\[([^[\]\n]+?)\]\]/.exec(src)
      return m ? { type: NOTE_LINK, raw: m[0], title: m[1].trim() } : undefined
    },
  },

  parseMarkdown: (token) => ({ type: NOTE_LINK, attrs: { id: null, title: String(token.title ?? "") } }),

  renderMarkdown: (node) => `[[${String(node.attrs?.title ?? "")}]]`,

  addNodeView() {
    return ReactNodeViewRenderer(NoteLinkView)
  },

  addProseMirrorPlugins() {
    const options = this.options
    return [
      Suggestion<Item, Item>({
        editor: this.editor,
        pluginKey: new PluginKey("noteLinkSuggestion"),
        char: "[[",
        allowSpaces: true,
        allowedPrefixes: null,
        items: ({ query }) => {
          const q = query.replace(/\]+$/, "").trim()
          const found: Item[] = options.find(q).slice(0, 8).map((target) => ({ kind: "note", target }))
          const exact = found.some((f) => f.kind === "note" && f.target.title.toLowerCase() === q.toLowerCase())
          return q && !exact ? [...found, { kind: "create", title: q.slice(0, 200) }] : found
        },
        command: ({ editor, range, props }) => {
          const target = props.kind === "note" ? props.target : { id: options.create(props.title), title: props.title }
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              { type: NOTE_LINK, attrs: { id: target.id, title: target.title } },
              { type: "text", text: " " },
            ])
            .run()
        },
        render: () => {
          let menu: ReactRenderer<unknown, MenuProps> | null = null
          let unmount: (() => void) | undefined
          let current: SuggestionProps<Item, Item> | null = null
          let active = 0
          const draw = () => current && menu?.updateProps({ items: current.items, active, pick: (i: number) => current?.command(current.items[i]) })
          return {
            onStart: (props) => {
              current = props
              active = 0
              menu = new ReactRenderer(LinkMenu, { editor: props.editor, props: { items: props.items, active, pick: (i: number) => props.command(props.items[i]) } })
              unmount = props.mount(menu.element)
            },
            onUpdate: (props) => {
              if (props.items !== current?.items) active = 0
              current = props
              draw()
            },
            onKeyDown: ({ event }) => {
              const n = current?.items.length ?? 0
              if (!current || !n) return false
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                active = (active + (event.key === "ArrowDown" ? 1 : n - 1)) % n
                draw()
                return true
              }
              if (event.key === "Enter" || event.key === "Tab") {
                current.command(current.items[active])
                return true
              }
              return false
            },
            onExit: () => {
              unmount?.()
              menu?.destroy()
              menu = null
              current = null
            },
          }
        },
      }),
    ]
  },
})

/** Starts a note link where the cursor is, opening the list of notes (the toolbar's link button). */
export function startNoteLink(editor: Editor) {
  editor.chain().focus().insertContent("[[").run()
}

interface MenuProps {
  items: Item[]
  active: number
  pick: (index: number) => void
}

function LinkMenu({ items, active, pick }: MenuProps) {
  return (
    <div data-slot="popover-content" role="listbox" aria-label="Link to a note" className="z-50 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10">
      {items.length ? (
        items.map((item, i) => (
          <button
            key={item.kind === "note" ? item.target.id : "create"}
            type="button"
            role="option"
            aria-selected={i === active}
            // keep the editor's selection: picking happens on click, not on focus
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pick(i)}
            className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm", i === active ? "bg-accent text-accent-foreground" : "hover:bg-accent/60")}
          >
            {item.kind === "note" ? <FileText className="size-4 shrink-0 text-muted-foreground" /> : <Plus className="size-4 shrink-0 text-violet" />}
            <span className="min-w-0 flex-1 truncate">{item.kind === "note" ? item.target.title || "Untitled" : `New note “${item.title}”`}</span>
            {item.kind === "note" && item.target.folder && <span className="max-w-24 shrink-0 truncate text-[11px] text-muted-foreground">{item.target.folder.split("/").pop()}</span>}
          </button>
        ))
      ) : (
        <p className="px-2 py-1.5 text-sm text-muted-foreground">Type a note&apos;s name</p>
      )}
    </div>
  )
}

/** The link chip: the note's current title, or a dashed "missing" look when it's gone (tap to make it). */
function NoteLinkView({ node, extension, updateAttributes }: NodeViewProps) {
  const id = (node.attrs.id as string | null) ?? null
  const live = useNoteTitle(id)
  const missing = live === null
  const title = (live ?? (node.attrs.title as string)) || "Untitled"
  const options = extension.options as NoteLinkOptions
  const follow = () => {
    if (!missing && id) return options.open(id)
    const made = options.create(node.attrs.title as string, id ?? undefined)
    if (!id) updateAttributes({ id: made })
    options.open(made)
  }
  return (
    <NodeViewWrapper
      as="span"
      data-note-link=""
      role="link"
      tabIndex={-1}
      title={missing ? "No such note yet. Tap to make it." : undefined}
      onClick={follow}
      className={cn("note-link", missing && "is-missing")}
    >
      {title}
    </NodeViewWrapper>
  )
}
