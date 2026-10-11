import type { Metadata } from "next"
import { MyDayView } from "@/features/planner/my-day-view"

export const metadata: Metadata = { title: "My Day" }

export default function Page() {
  return <MyDayView />
}
