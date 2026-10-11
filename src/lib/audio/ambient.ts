"use client"

import type { AmbientKind } from "@/lib/stores/focus"

/**
 * Ambient sound is synthesised with the Web Audio API (no audio files):
 * white, pink and brown noise, plus a filtered "rain" texture. Browsers only
 * allow audio after a user gesture, so playback always starts from a click.
 */
class AmbientPlayer {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private source: AudioBufferSourceNode | null = null
  private extra: AudioNode[] = []
  kind: AmbientKind = "off"

  private context() {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new Ctx()
      this.master = this.ctx.createGain()
      this.master.connect(this.ctx.destination)
    }
    return this.ctx
  }

  private noise(kind: Exclude<AmbientKind, "off" | "rain"> | "pink"): AudioBuffer {
    const ctx = this.context()
    const length = ctx.sampleRate * 6
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1
      if (kind === "white") {
        data[i] = white * 0.35
      } else if (kind === "pink") {
        b0 = 0.99886 * b0 + white * 0.0555179
        b1 = 0.99332 * b1 + white * 0.0750759
        b2 = 0.969 * b2 + white * 0.153852
        b3 = 0.8665 * b3 + white * 0.3104856
        b4 = 0.55 * b4 + white * 0.5329522
        b5 = -0.7616 * b5 - white * 0.016898
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.09
        b6 = white * 0.115926
      } else {
        last = (last + 0.02 * white) / 1.02
        data[i] = last * 3.2
      }
    }
    // short fade at the loop seam
    const fade = Math.floor(ctx.sampleRate * 0.05)
    for (let i = 0; i < fade; i++) {
      data[i] *= i / fade
      data[length - 1 - i] *= i / fade
    }
    return buffer
  }

  async play(kind: AmbientKind, volume: number) {
    this.stop()
    this.kind = kind
    if (kind === "off") return
    const ctx = this.context()
    if (ctx.state === "suspended") await ctx.resume()

    const src = ctx.createBufferSource()
    src.buffer = this.noise(kind === "rain" ? "pink" : kind)
    src.loop = true
    let tail: AudioNode = src

    if (kind === "rain") {
      const hp = ctx.createBiquadFilter()
      hp.type = "highpass"
      hp.frequency.value = 450
      const lp = ctx.createBiquadFilter()
      lp.type = "lowpass"
      lp.frequency.value = 5200
      const swell = ctx.createGain()
      swell.gain.value = 0.85
      const lfo = ctx.createOscillator()
      lfo.frequency.value = 0.12
      const lfoDepth = ctx.createGain()
      lfoDepth.gain.value = 0.15
      lfo.connect(lfoDepth).connect(swell.gain)
      lfo.start()
      src.connect(hp).connect(lp).connect(swell)
      tail = swell
      this.extra = [hp, lp, swell, lfo, lfoDepth]
    }

    tail.connect(this.master!)
    this.setVolume(volume)
    src.start()
    this.source = src
  }

  setVolume(v: number) {
    if (!this.master || !this.ctx) return
    this.master.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), this.ctx.currentTime, 0.08)
  }

  stop() {
    try {
      this.source?.stop()
    } catch {
      // already stopped
    }
    this.source?.disconnect()
    for (const n of this.extra) {
      if (n instanceof OscillatorNode) n.stop()
      n.disconnect()
    }
    this.source = null
    this.extra = []
    this.kind = "off"
  }
}

export const ambient = typeof window !== "undefined" ? new AmbientPlayer() : (null as unknown as AmbientPlayer)

/** A soft two-note chime for when a session ends. Silently does nothing if audio is unavailable. */
export function playChime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    const notes = [659.25, 987.77]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = "sine"
      osc.frequency.value = freq
      const t = ctx.currentTime + i * 0.18
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.18, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.4)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 1.5)
    })
    setTimeout(() => void ctx.close(), 2200)
  } catch {
    // audio blocked: the toast and notification still fire
  }
}
