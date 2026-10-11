"use client"

import { Hash, X } from "lucide-react"
import { useState } from "react"
import { normalizeTag } from "@/lib/domain/tasks"

export function TagInput({ value, onChange, suggestions = [], id }: { value: string[]; onChange: (tags: string[]) => void; suggestions?: string[]; id?: string }) {
  const [draft, setDraft] = useState("")
  const add = (raw: string) => {
    const tag = normalizeTag(raw)
    if (!tag || value.includes(tag) || value.length >= 12) return
    onChange([...value, tag])
    setDraft("")
  }
  const remaining = suggestions.filter((s) => !value.includes(s) && (!draft || s.startsWith(normalizeTag(draft)))).slice(0, 6)

  return (
    <div>
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-xl border border-input bg-input/30 px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring">
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-control bg-violet/15 py-0.5 pr-1 pl-2 text-xs font-medium text-violet">
            #{t}
            <button type="button" aria-label={`Remove tag ${t}`} onClick={() => onChange(value.filter((x) => x !== t))} className="grid size-4 place-items-center rounded-full hover:bg-violet/20">
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "," || e.key === " ") {
              if (draft.trim()) {
                e.preventDefault()
                add(draft)
              }
            } else if (e.key === "Backspace" && !draft && value.length) {
              onChange(value.slice(0, -1))
            }
          }}
          onBlur={() => draft.trim() && add(draft)}
          placeholder={value.length ? "" : "Add tags…"}
          className="min-w-24 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
          aria-label="Add a tag"
        />
      </div>
      {remaining.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {remaining.map((s) => (
            <button key={s} type="button" onClick={() => add(s)} className="inline-flex items-center gap-0.5 rounded-control border border-line px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground">
              <Hash className="size-3" />
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
