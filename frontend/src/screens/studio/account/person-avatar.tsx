import { cn } from "@/lib/utils"

/** Who an avatar stands for: a person signed in with GitHub, or Local developer. */
export type AccountKind = "person" | "local"

/** The first letters of the first and last word of a name: "Ada Example" is AE. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const first = words[0]?.[0] ?? ""
  const last = words.length > 1 ? (words[words.length - 1][0] ?? "") : ""
  return (first + last).toUpperCase()
}

/**
 * The circle with a person's initials (Figma Avatar, `463:17223`). Local developer is grey, so it never reads as
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
  kind: AccountKind
  /** `sm` (24) in the top bar, `default` (32) in the account menu. */
  size?: "sm" | "default"
}) {
  // Initials only, never a picture, so a circle and no shadcn Avatar.
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full select-none",
        size === "sm"
          ? "size-6 type-ui-2xs-medium"
          : "size-8 type-ui-xs-medium",
        kind === "person"
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-foreground"
      )}
    >
      {initials(name)}
    </span>
  )
}
