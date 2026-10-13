"use client"

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { createBlock, deleteBlock } from "@/lib/db/repo"
import { formatClock, formatDuration } from "@/lib/domain/dates"
import type { BlockKind, Task } from "@/lib/domain/types"
import { attempt } from "@/lib/feedback"
import { useUI } from "@/lib/stores/ui"
import { cn } from "@/lib/utils"
import { KIND_LABEL } from "./block-editor"
import { useCentredCard } from "./centred-card"

const LENGTHS = [15, 30, 45, 60, 90, 120]
const KINDS: BlockKind[] = ["event", "task", "focus", "break"]
// choosing a chip leaves the title focused, so Enter still adds and a phone keeps its keyboard up
const keepFocus = (e: MouseEvent) => e.preventDefault()
const chip = (on: boolean) => cn("pressable rounded-full px-2.5 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring", on ? "bg-foreground text-background" : "bg-foreground/[0.06] hover:bg-foreground/10")

/** Adds a block, with an Undo on the toast. */
export async function addBlock(input: { date: string; start: number; end: number; title: string; kind: BlockKind; taskId?: string | null }) {
  const block = await attempt(() => createBlock({ ...input, taskId: input.taskId ?? null }))
  if (block) {
    toast.success(`${block.title} · ${formatClock(block.start)}–${formatClock(block.end)}`, {
      action: { label: "Undo", onClick: () => void attempt(() => deleteBlock(block.id)) },
    })
  }
  return block
}

/**
 * The small card that opens where you draw or tap on the timeline, instead of the full
 * editor: a title, how long, what kind, or one of the tasks waiting to be scheduled.
 * Enter adds it; Escape or a tap elsewhere drops it; More options opens the full editor.
 */
export function QuickCreate({
  date,
  start,
  end,
  tasks,
  style,
  onResize,
  onClose,
}: {
  date: string
  start: number
  end: number
  /** Tasks waiting to be scheduled, offered as one-tap titles. */
  tasks: Task[]
  style: CSSProperties
  onResize: (end: number) => void
  onClose: () => void
}) {
  const [title, setTitle] = useState("")
  const [kind, setKind] = useState<BlockKind>("event")
  const [taskId, setTaskId] = useState<string | null>(null)
  const openBlockEditor = useUI((s) => s.openBlockEditor)
  const card = useRef<HTMLDivElement>(null)
  // centred under the block being drawn, which spans the timeline
  useCentredCard(card, 0.5)
  const input = useRef<HTMLInputElement>(null)
  const length = end - start

  useEffect(() => {
    input.current?.focus({ preventScroll: true })
    card.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [])

  // a tap anywhere else drops the card
  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (!card.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener("pointerdown", away, true)
    return () => document.removeEventListener("pointerdown", away, true)
  }, [onClose])

  const save = async () => {
    if (!title.trim()) {
      input.current?.focus()
      return
    }
    if (await addBlock({ date, start, end, title: title.trim(), kind, taskId })) onClose()
  }
  const pick = (t: Task) => {
    setTitle(t.title)
    setTaskId(t.id)
    setKind(t.estimateMin >= 45 ? "focus" : "task")
    onResize(Math.min(24 * 60, start + Math.min(180, Math.max(15, Math.round(t.estimateMin / 15) * 15))))
  }

  return (
    <div
      ref={card}
      role="dialog"
      aria-label={`New block at ${formatClock(start)}`}
      className="absolute z-40 w-[min(19rem,calc(100%-0.5rem))] rounded-2xl border border-line bg-popover p-3 text-popover-foreground shadow-2xl animate-in fade-in-0 zoom-in-95"
      style={style}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return
        e.stopPropagation()
        onClose()
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <input
          ref={input}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            setTaskId(null)
          }}
          placeholder="What's this time for?"
          aria-label="Block title"
          enterKeyHint="done"
          maxLength={120}
          className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <p className="mt-2 px-0.5 text-xs text-muted-foreground tabular">
          {formatClock(start)}–{formatClock(end)} · {formatDuration(length)}
        </p>
        <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Length">
          {LENGTHS.map((m) => (
            <button key={m} type="button" aria-pressed={length === m} onMouseDown={keepFocus} onClick={() => onResize(Math.min(24 * 60, start + m))} className={chip(length === m)}>
              {m < 60 ? `${m}m` : `${m / 60}h`}
            </button>
          ))}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1" role="radiogroup" aria-label="Kind">
          {KINDS.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onMouseDown={keepFocus} onClick={() => setKind(k)} className={chip(kind === k)}>
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        {tasks.length > 0 && !taskId && (
          <div className="mt-3 border-t border-line pt-2">
            <p className="mb-1 px-0.5 text-[11px] font-medium text-muted-foreground">Or a task waiting for a time</p>
            {tasks.slice(0, 3).map((t) => (
              <button key={t.id} type="button" onMouseDown={keepFocus} onClick={() => pick(t)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs outline-none hover:bg-foreground/[0.06] focus-visible:ring-2 focus-visible:ring-ring">
                <span className="min-w-0 flex-1 truncate">{t.title}</span>
                <span className="shrink-0 text-muted-foreground tabular">{formatDuration(t.estimateMin)}</span>
              </button>
            ))}
          </div>
        )}
        <div className="mt-3 flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              onClose()
              openBlockEditor({ date, start })
            }}
          >
            More options
          </Button>
          <Button type="button" size="sm" variant="ghost" className="ml-auto" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={!title.trim()}>
            Add
          </Button>
        </div>
      </form>
    </div>
  )
}
