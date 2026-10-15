"use client"

import { useSyncExternalStore } from "react"
import type { Note } from "@/lib/domain/types"

/*
  Every note's current title, for links inside the editor: a link shows the title the note
  has now (even while the note holding the link is open and being edited), and a link to
  a note that's gone looks missing. The Notes page keeps this up to date.
*/
let titles: ReadonlyMap<string, string> | null = null
const listeners = new Set<() => void>()

export function setNoteTitles(notes: Pick<Note, "id" | "title">[]) {
  const same = titles && titles.size === notes.length && notes.every((n) => titles!.get(n.id) === n.title)
  if (same) return
  titles = new Map(notes.map((n) => [n.id, n.title]))
  for (const l of listeners) l()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** The note's title; `null` if it doesn't exist; `undefined` until the notes have loaded. */
export function useNoteTitle(id: string | null): string | null | undefined {
  return useSyncExternalStore(
    subscribe,
    () => (titles === null ? undefined : id ? (titles.get(id) ?? null) : null),
    () => undefined,
  )
}
