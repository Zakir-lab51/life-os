import { useEffect, useState } from "react"

/**
 * True for `ms` after `value` changes, and never on the first render: feedback that
 * should play when you do something (tick a task, check in a habit), not every time a
 * page loads with things already done.
 */
export function useJustChanged<T>(value: T, ms = 700): boolean {
  const [prev, setPrev] = useState(value)
  const [active, setActive] = useState(false)
  if (!Object.is(prev, value)) {
    setPrev(value)
    setActive(true)
  }
  useEffect(() => {
    if (!active) return
    const t = setTimeout(() => setActive(false), ms)
    return () => clearTimeout(t)
  }, [active, prev, ms])
  return active
}
