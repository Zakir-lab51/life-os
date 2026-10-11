"use client"

import { toast } from "sonner"
import { BlockedError, NotFoundError, ValidationError } from "@/lib/db/repo"

/** Shows an error as a toast with a message people can act on. */
export function reportError(e: unknown, fallback = "Something went wrong. Your data is safe; try again.") {
  if (e instanceof ValidationError || e instanceof BlockedError || e instanceof NotFoundError) {
    toast.error(e.message)
    return
  }
  if (e instanceof Error && e.name === "DatabaseClosedError") {
    toast.error("The database closed unexpectedly. Reload the page to reconnect.")
    return
  }
  if (e instanceof Error && e.message) {
    toast.error(e.message)
    return
  }
  console.error(e)
  toast.error(fallback)
}

/**
 * Runs an action that returns nothing and reports failures. Returns whether it
 * succeeded. Use this instead of `attempt` for void functions, where an
 * `undefined` result can't tell success from failure.
 */
export async function succeeded(fn: () => Promise<unknown>, fallback?: string): Promise<boolean> {
  try {
    await fn()
    return true
  } catch (e) {
    reportError(e, fallback)
    return false
  }
}

/** Runs an async action that returns a value, and reports failures. Returns undefined on error. */
export async function attempt<T>(fn: () => Promise<T>, fallback?: string): Promise<T | undefined> {
  try {
    return await fn()
  } catch (e) {
    reportError(e, fallback)
    return undefined
  }
}
