import type { Metadata } from "next"
import { PlannedView } from "@/features/planned/planned-view"

export const metadata: Metadata = { title: "Goals" }

export default function Page() {
  return <PlannedView module="goals" />
}
