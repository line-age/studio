import { cn } from "@/lib/utils"

import tightLineLight from "./assets/tight-line-light.svg"
import tightLine from "./assets/tight-line.svg"

/**
 * The Tight Line credit (Figma `DevelopedBy`, `465:17257`). Dark, at the
 * bottom of the editions panel; light on white, where the panel is hidden.
 */
export function DevelopedBy({
  surface,
}: {
  /** What it sits on: the dark editions panel, or the white form side. */
  surface: "dark" | "light"
}) {
  const dark = surface === "dark"
  return (
    <p
      className={cn(
        "flex items-center gap-2.5 type-ui-xs",
        dark ? "text-topbar-foreground" : "text-muted-foreground"
      )}
    >
      Developed by
      <img
        src={dark ? tightLineLight : tightLine}
        alt="Tight Line"
        width={96.727}
        height={16}
      />
    </p>
  )
}
