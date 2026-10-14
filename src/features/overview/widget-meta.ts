import type { WidgetId } from "@/lib/domain/types"

/** The Overview widgets' names, for the dashboard and Settings (kept apart so Settings doesn't load the dashboard and its charts). */
export const WIDGET_META: Record<WidgetId, { label: string; description: string }> = {
  hero: { label: "Greeting & score", description: "Live clock and today's productivity score" },
  briefing: { label: "Daily briefing", description: "Top priorities, what needs attention, focus suggestions" },
  today: { label: "Today's tasks", description: "Due today and overdue" },
  radar: { label: "Life balance", description: "Radar across your life areas" },
  habits: { label: "Habits", description: "Check in today's habits" },
  focus: { label: "Focus", description: "Minutes today and the last 7 days" },
  schedule: { label: "Up next", description: "What's left on today's timeline" },
  deadlines: { label: "Upcoming deadlines", description: "The next two weeks" },
  weekly: { label: "Weekly targets", description: "Tasks, focus and habit consistency" },
  xp: { label: "Level & XP", description: "Progress and the next achievement" },
  insight: { label: "Insight", description: "A pattern from your own data" },
  goals: { label: "Goals", description: "Your active goals and whether they're on track" },
}
