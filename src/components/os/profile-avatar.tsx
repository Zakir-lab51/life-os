import { User } from "lucide-react"
import { cn } from "@/lib/utils"

/** The round avatar with your initial, shared by the sidebar and Settings. */
export function ProfileAvatar({ name, size = "md", className }: { name: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const initial = name.trim().charAt(0).toUpperCase()
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-semibold text-white shadow-[inset_0_1px_0_oklch(1_0_0/0.35),0_2px_8px_-2px_oklch(0_0_0/0.3)]",
        size === "sm" && "size-8 text-sm",
        size === "md" && "size-10 text-base",
        size === "lg" && "size-16 text-2xl",
        className,
      )}
      style={{ background: "linear-gradient(145deg, color-mix(in oklch, var(--violet) 70%, white), var(--violet))" }}
    >
      {initial || <User className="size-[55%]" strokeWidth={2.2} />}
    </span>
  )
}
