export { cn } from "cn"

/** Stable, sortable-enough unique id for local records. */
export function uid(prefix = ""): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 16)
      : Math.random().toString(36).slice(2, 18)
  return `${prefix}${Date.now().toString(36)}${rand}`
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

export function pluralize(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`
}

export function sum(values: number[]) {
  return values.reduce((a, b) => a + b, 0)
}
