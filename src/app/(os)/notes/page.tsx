import type { Metadata } from "next"
import { PlannedView } from "@/features/planned/planned-view"

export const metadata: Metadata = { title: "Second Brain" }

export default function Page() {
  return <PlannedView module="notes" />
}
