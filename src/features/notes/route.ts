"use client"

import { hashRoute } from "@/features/shell/hash-route"

/* A note opens at /notes#n_… (journal entries at /notes#journal:2026-10-15); see hash-route.ts. */
const route = hashRoute("/notes", (h) => h.startsWith("n_") || h.startsWith("journal:"))

export const useOpenNoteId = route.useOpenId
export const noteHref = route.href
export const openNote = route.open
export const closeNote = route.close
