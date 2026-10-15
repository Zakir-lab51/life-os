"use client"

import { Waypoints } from "lucide-react"
import { useRouter } from "next/navigation"
import { useLayoutEffect, useMemo, useRef, useState } from "react"
import { Switch } from "@/components/ui/switch"
import { Panel, PanelHeader } from "@/components/os/panel"
import { EmptyState } from "@/components/os/visuals"
import { ACCENT_CLASSES } from "@/lib/domain/areas"
import { layoutGraph, noteGraph } from "@/lib/domain/notes"
import type { AccentColor, Note } from "@/lib/domain/types"
import { cn } from "@/lib/utils"
import { openNote } from "./route"

const COLORS: AccentColor[] = ["violet", "cyan", "mint", "amber", "rose", "blue", "lilac"]

/** A colour per top-level folder, the same every time. */
function folderColor(folder: string | null): string {
  if (!folder) return "var(--muted-foreground)"
  const top = folder.split("/")[0]
  let h = 0
  for (const ch of top) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return ACCENT_CLASSES[COLORS[h % COLORS.length]].fill
}

/**
 * The knowledge graph: every note as a dot (bigger with more links, coloured by its top
 * folder) and every link as a line. Pointing at a note lights up the notes it's linked
 * with; tapping one opens it.
 */
export function NoteGraph({ notes }: { notes: Note[] }) {
  const router = useRouter()
  const [journal, setJournal] = useState(false)
  const [hover, setHover] = useState<string | null>(null)
  // drawn at the panel's real size, so dots and names stay readable on a phone
  const box = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(0)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setW(Math.round(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const H = Math.round(Math.min(640, Math.max(340, W * 0.68)))
  const shown = useMemo(() => notes.filter((n) => journal || n.kind !== "journal"), [notes, journal])
  // laid out again only when notes or links change, not on every edit
  const shape = shown.map((n) => `${n.id}>${n.links.join(",")}`).join("|")
  const { nodes, edges } = useMemo(() => {
    const g = noteGraph(shown)
    return { nodes: W ? layoutGraph(g.nodes, g.edges, { width: W, height: H, pad: 44 }) : [], edges: g.edges }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape, W, H])
  const titles = new Map(shown.map((n) => [n.id, n.title || "Untitled"]))
  const at = new Map(nodes.map((n) => [n.id, n]))
  const near = useMemo(() => {
    if (!hover) return null
    const set = new Set([hover])
    for (const e of edges) {
      if (e.a === hover) set.add(e.b)
      if (e.b === hover) set.add(e.a)
    }
    return set
  }, [hover, edges])

  return (
    <Panel>
      <PanelHeader
        title="Graph"
        subtitle={`${nodes.length} note${nodes.length === 1 ? "" : "s"} · ${edges.length} link${edges.length === 1 ? "" : "s"}. Bigger dots have more links; tap one to open it.`}
        action={
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={journal} onCheckedChange={setJournal} aria-label="Show journal entries" />
            Journal
          </label>
        }
      />
      <div ref={box} className="w-full">
        {edges.length === 0 ? (
          <EmptyState compact icon={Waypoints} title="No links yet" body="Type [[ in a note to link it to another. Linked notes gather together here." />
        ) : (
          W > 0 && (
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block touch-manipulation select-none" role="group" aria-label="Notes and the links between them">
              <g>
                {edges.map((e) => {
                  const a = at.get(e.a)
                  const b = at.get(e.b)
                  if (!a || !b) return null
                  const lit = near?.has(e.a) && near?.has(e.b) && (e.a === hover || e.b === hover)
                  return (
                    <line
                      key={`${e.a}-${e.b}`}
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke={lit ? "var(--violet)" : "color-mix(in oklab, var(--foreground) 32%, transparent)"}
                      strokeWidth={lit ? 2 : 1.25}
                      strokeOpacity={near && !lit ? 0.35 : 1}
                    />
                  )
                })}
              </g>
              {nodes.map((n) => {
                const r = 5 + Math.sqrt(n.degree) * 3
                const dim = near && !near.has(n.id)
                const label = n.degree > 0 || hover === n.id
                return (
                  <g
                    key={n.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${titles.get(n.id)}, ${n.degree} link${n.degree === 1 ? "" : "s"}`}
                    transform={`translate(${n.x} ${n.y})`}
                    className="cursor-pointer outline-none [&:focus-visible>circle]:stroke-ring"
                    onMouseEnter={() => setHover(n.id)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(n.id)}
                    onBlur={() => setHover(null)}
                    onClick={() => openNote(n.id, (h) => router.push(h))}
                    onKeyDown={(e) => e.key === "Enter" && openNote(n.id, (h) => router.push(h))}
                  >
                    <circle r={Math.max(r, 14)} fill="transparent" />
                    <circle r={r} fill={folderColor(n.folder)} fillOpacity={dim ? 0.25 : 0.9} stroke="var(--background)" strokeWidth={1.5} />
                    {label && (
                      <text y={r + 14} x={n.x > W - 90 ? r : n.x < 90 ? -r : 0} textAnchor={n.x > W - 90 ? "end" : n.x < 90 ? "start" : "middle"} className={cn("text-[12px] font-medium", dim ? "fill-muted-foreground/40" : "fill-foreground")} style={{ paintOrder: "stroke", stroke: "var(--surface)", strokeWidth: 3 }}>
                        {(titles.get(n.id) ?? "").slice(0, 28)}
                      </text>
                    )}
                  </g>
                )
              })}
            </svg>
          )
        )}
      </div>
    </Panel>
  )
}
