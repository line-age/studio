import { Avatar } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

/** The first letters of the first and last word of a name: "Ada Example" is AE. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const first = words[0]?.[0] ?? ""
  const last = words.length > 1 ? (words[words.length - 1][0] ?? "") : ""
  return (first + last).toUpperCase()
}

/**
 * The circle with a person's initials (Figma Avatar, `463:17223`; shadcn
 * Avatar, fallback only). Local developer is grey, so it never reads as
 * an account.
 */
export function PersonAvatar({
  name,
  kind,
  size = "sm",
}: {
  /** Whose initials: "Ada Example" shows AE. */
  name: string
  /** A person signed in with GitHub, or Local developer on one machine. */
  kind: "person" | "local"
  /** `sm` (24) in the top bar, `default` (32) in the account menu. */
  size?: "sm" | "default"
}) {
  return (
    <Avatar size={size} className="after:hidden" aria-hidden="true">
      {/* Initials only, never a picture: a plain span, at the design's own type. */}
      <span
        className={cn(
          "flex size-full items-center justify-center rounded-full",
          size === "sm" ? "type-ui-2xs-medium" : "type-ui-xs-medium",
          kind === "person"
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        )}
      >
        {initials(name)}
      </span>
    </Avatar>
  )
}
