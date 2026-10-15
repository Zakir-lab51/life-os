import type { Metadata } from "next"
import { NotesView } from "@/features/notes/notes-view"

export const metadata: Metadata = { title: "Second Brain" }

export default function Page() {
  return <NotesView />
}
