// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useJustChanged } from "@/lib/use-just-changed"

afterEach(() => vi.useRealTimers())

describe("useJustChanged (feedback plays when you act, not on load)", () => {
  it("stays quiet on the first render, even for a done item", () => {
    const { result } = renderHook(() => useJustChanged(true))
    expect(result.current).toBe(false)
  })

  it("is true for a moment after the value changes, then settles", () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ v }) => useJustChanged(v, 700), { initialProps: { v: false } })
    rerender({ v: true })
    expect(result.current).toBe(true)
    act(() => void vi.advanceTimersByTime(699))
    expect(result.current).toBe(true)
    act(() => void vi.advanceTimersByTime(2))
    expect(result.current).toBe(false)
  })

  it("restarts the moment when the value changes again", () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ v }) => useJustChanged(v, 700), { initialProps: { v: 0 } })
    rerender({ v: 1 })
    act(() => void vi.advanceTimersByTime(500))
    rerender({ v: 2 })
    act(() => void vi.advanceTimersByTime(500))
    expect(result.current).toBe(true)
  })
})
