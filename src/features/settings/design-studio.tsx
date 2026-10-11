"use client"

import { Check, ClipboardCopy, ClipboardPaste, RotateCcw } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import { updatePrefs } from "@/lib/db/repo"
import { asset, DESIGN_LIMITS, FONTS, MATERIALS, PHOTOS, PRESETS, applyDesign, sameDesign, sameLook, type Design, type FontId, type Look, type MaterialId, type PhotoId } from "@/lib/design/design"
import { reportError } from "@/lib/feedback"
import { designSchema } from "@/lib/validation/schemas"
import { cn } from "@/lib/utils"

const swatch = (d: Pick<Look, "hue" | "saturation">) => `oklch(0.72 ${(0.15 * d.saturation).toFixed(3)} ${d.hue})`

type SliderSpec = { key: keyof typeof DESIGN_LIMITS; label: string; ariaLabel?: string; step: number; left?: string; right?: string; format: (v: number) => string }

const LOOK_SLIDERS: SliderSpec[] = [
  { key: "hue", label: "Accent colour", step: 1, format: (v) => `${Math.round(v)}°` },
  { key: "saturation", label: "Colour intensity", step: 0.05, left: "Greyscale", right: "Vivid", format: (v) => `${Math.round(v * 100)}%` },
  { key: "radius", label: "Corner roundness", step: 0.05, left: "Sharp", right: "Round", format: (v) => `${Math.round(v * 16)}px` },
  { key: "glow", label: "Background glow", step: 0.05, left: "Off", right: "Strong", format: (v) => (v === 0 ? "Off" : `${Math.round(v * 100)}%`) },
  { key: "scale", label: "Interface size", step: 0.0125, left: "Compact", right: "Large", format: (v) => `${Math.round(v * 100)}%` },
]

const GLASS_SLIDERS: SliderSpec[] = [
  { key: "glass", label: "Transparency", ariaLabel: "Glass transparency", step: 0.05, left: "Solid", right: "Clear", format: (v) => `${Math.round(v * 100)}%` },
  { key: "glassBlur", label: "Blur", ariaLabel: "Glass blur", step: 1, left: "Sharp", right: "Frosted", format: (v) => (v === 0 ? "Off" : `${Math.round(v)}px`) },
]

const PHOTO_SLIDERS: SliderSpec[] = [
  { key: "photoDim", label: "Dimming", ariaLabel: "Photo dimming", step: 0.05, left: "Clear", right: "Faint", format: (v) => `${Math.round(v * 100)}%` },
  { key: "photoBlur", label: "Blur", ariaLabel: "Photo blur", step: 1, left: "Sharp", right: "Soft", format: (v) => (v === 0 ? "Off" : `${Math.round(v)}px`) },
]

// a design waiting to be saved; flushed after a short pause or when the studio unmounts
let pending: Design | null = null
function flush() {
  if (!pending) return
  const design = pending
  pending = null
  updatePrefs({ design }).catch(reportError)
}

/** Live editor for the design controls. Changes apply instantly and save after a short pause. */
export function DesignStudio({ saved }: { saved: Design }) {
  const [draft, setDraft] = useState<Design>(saved)
  const [seen, setSeen] = useState(saved)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasted, setPasted] = useState("")

  // adopt changes made elsewhere (a restored backup, a wipe) unless an edit is still waiting to save
  if (saved !== seen) {
    setSeen(saved)
    if (!pending && !sameDesign(saved, draft)) setDraft(saved)
  }

  // persist after the user stops dragging; the page already shows the change
  useEffect(() => {
    pending = sameDesign(draft, saved) ? null : draft
    if (!pending) return
    const t = setTimeout(flush, 400)
    return () => clearTimeout(t)
  }, [draft, saved])
  useEffect(() => flush, [])

  const update = (patch: Partial<Design>) => {
    const next = { ...draft, ...patch }
    applyDesign(next)
    setDraft(next)
  }

  const preset = PRESETS[draft.preset]
  const modified = preset ? !sameLook(draft, preset.look) : true

  const copyCode = async () => {
    const code = JSON.stringify(draft)
    try {
      await navigator.clipboard.writeText(code)
      toast.success("Design code copied", { description: "Paste it to Claude, or into another LIFE OS, to reuse this exact look." })
    } catch {
      setPasted(code)
      setPasteOpen(true)
      toast("Copy it from the box below", { description: "Clipboard access was blocked." })
    }
  }

  const applyCode = () => {
    let json: unknown
    try {
      json = JSON.parse(pasted)
    } catch {
      toast.error("That isn't a design code", { description: 'It should start with {"preset":' })
      return
    }
    const parsed = designSchema.safeParse(json)
    if (!parsed.success) {
      toast.error("That design code has a value out of range")
      return
    }
    update(parsed.data)
    setPasteOpen(false)
    setPasted("")
    toast.success("Design applied")
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 id="s-looks" className="scroll-mt-28 text-sm font-medium">Looks</h3>
          {modified && <span className="rounded-control bg-surface-2 px-2 py-0.5 text-[11px] text-muted-foreground">Customised{preset ? ` from ${preset.label}` : ""}</span>}
        </div>
        <div className="grid grid-cols-2 gap-2 @2xl:grid-cols-3">
          {Object.entries(PRESETS).map(([id, p]) => {
            const active = draft.preset === id && !modified
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                onClick={() => update({ ...p.look })}
                className={cn("flex items-center gap-3 border p-3 text-left transition-colors", active ? "border-foreground/40 bg-surface-3" : "border-line hover:border-foreground/25")}
                // each card previews its own roundness
                style={{ borderRadius: `${p.look.radius * 1.1}rem` }}
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-full" style={{ background: swatch(p.look) }}>
                  {active && <Check className="size-4 text-black/70" strokeWidth={3} />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold" style={{ fontFamily: FONTS[p.look.font].cssVar }}>
                    {p.label}
                  </span>
                  <span className="line-clamp-2 text-[11px] text-muted-foreground">{p.description}</span>
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid gap-x-8 gap-y-5 @2xl:grid-cols-2">
        {LOOK_SLIDERS.map((spec) => (
          <SliderRow key={spec.key} spec={spec} value={draft[spec.key]} onChange={(v) => update({ [spec.key]: v })}>
            {spec.key === "hue" && (
              <div
                aria-hidden
                className="mb-2 h-2 rounded-full"
                style={{ background: `linear-gradient(90deg, ${Array.from({ length: 13 }, (_, i) => `oklch(0.72 ${(0.15 * Math.max(draft.saturation, 0.4)).toFixed(3)} ${i * 30})`).join(", ")})` }}
              />
            )}
          </SliderRow>
        ))}
      </div>

      <div>
        <h3 id="s-glass" className="mb-2 scroll-mt-28 text-sm font-medium">Glass</h3>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(MATERIALS) as MaterialId[]).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={draft.material === m}
              onClick={() => update({ material: m })}
              className={cn("rounded-xl border p-3 text-left transition-colors", draft.material === m ? "border-foreground/40 bg-surface-3" : "border-line hover:border-foreground/25")}
            >
              <span className="block text-sm font-semibold">{MATERIALS[m].label}</span>
              <span className="text-[11px] text-muted-foreground">{MATERIALS[m].description}</span>
            </button>
          ))}
        </div>
        <div className="mt-4 grid gap-x-8 gap-y-5 @2xl:grid-cols-2">
          {GLASS_SLIDERS.map((spec) => (
            <SliderRow key={spec.key} spec={spec} value={draft[spec.key]} onChange={(v) => update({ [spec.key]: v })} />
          ))}
        </div>
      </div>

      <div>
        <h3 id="s-font" className="mb-2 scroll-mt-28 text-sm font-medium">Font</h3>
        <div className="grid grid-cols-2 gap-2 @2xl:grid-cols-4">
          {(Object.keys(FONTS) as FontId[]).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={draft.font === f}
              onClick={() => update({ font: f })}
              className={cn("rounded-xl border p-3 text-left transition-colors", draft.font === f ? "border-foreground/40 bg-surface-3" : "border-line hover:border-foreground/25")}
            >
              <span className="block text-lg leading-tight font-semibold" style={{ fontFamily: FONTS[f].cssVar }}>
                Aa 123
              </span>
              <span className="text-[11px] text-muted-foreground">{FONTS[f].label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 id="s-background" className="mb-2 scroll-mt-28 text-sm font-medium">Background</h3>
        <div className="grid grid-cols-2 gap-2 @2xl:grid-cols-4">
          {(Object.keys(PHOTOS) as PhotoId[]).map((id) => {
            const photo = PHOTOS[id]
            const active = draft.photo === id
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                onClick={() => update({ photo: id })}
                className={cn("relative grid aspect-[16/10] place-items-end justify-start overflow-hidden rounded-xl border p-2 text-left transition-colors", active ? "border-foreground/50 ring-2 ring-foreground/20" : "border-line hover:border-foreground/25")}
                style={photo.small ? { background: `url("${asset(photo.small)}") center / cover` } : undefined}
              >
                <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-medium", photo.small ? "bg-black/45 text-white" : "text-muted-foreground")}>{photo.label}</span>
                {active && (
                  <span className="absolute top-2 right-2 grid size-5 place-items-center rounded-full bg-foreground text-background">
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                )}
              </button>
            )
          })}
        </div>
        {draft.photo !== "none" && (
          <>
            <div className="mt-4 grid gap-x-8 gap-y-5 @2xl:grid-cols-2">
              {PHOTO_SLIDERS.map((spec) => (
                <SliderRow key={spec.key} spec={spec} value={draft[spec.key]} onChange={(v) => update({ [spec.key]: v })} />
              ))}
            </div>
            {PHOTOS[draft.photo].credit && <p className="mt-3 text-[11px] text-muted-foreground">Photo: {PHOTOS[draft.photo].credit}</p>}
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-line pt-5">
        <Button variant="outline" size="sm" onClick={() => update({ ...(preset ?? PRESETS.violet).look })} disabled={!modified}>
          <RotateCcw /> Reset look to {(preset ?? PRESETS.violet).label}
        </Button>
        <Button variant="outline" size="sm" onClick={() => void copyCode()}>
          <ClipboardCopy /> Copy design code
        </Button>
        <Button variant="outline" size="sm" onClick={() => setPasteOpen((o) => !o)} aria-expanded={pasteOpen}>
          <ClipboardPaste /> Paste design code
        </Button>
      </div>
      {pasteOpen && (
        <div className="space-y-2">
          <Textarea value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder='{"preset":"violet","hue":303,…}' className="min-h-20 rounded-xl font-mono text-xs" aria-label="Design code" />
          <Button size="sm" onClick={applyCode} disabled={!pasted.trim()}>
            Apply design code
          </Button>
        </div>
      )}
    </div>
  )
}

function SliderRow({ spec, value, onChange, children }: { spec: SliderSpec; value: number; onChange: (v: number) => void; children?: ReactNode }) {
  const [min, max] = DESIGN_LIMITS[spec.key]
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-medium">{spec.label}</span>
        <span className="text-muted-foreground tabular">{spec.format(value)}</span>
      </div>
      {children}
      <Slider min={min} max={max} step={spec.step} value={[value]} onValueChange={([v]) => onChange(v)} aria-label={spec.ariaLabel ?? spec.label} />
      {spec.left && (
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>{spec.left}</span>
          <span>{spec.right}</span>
        </div>
      )}
    </div>
  )
}
