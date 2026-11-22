import { cn } from "@/lib/utils"

import tightLineLight from "./assets/tight-line-light.svg"
import tightLine from "./assets/tight-line.svg"

/** Tight Line's own site, where the logo leads. */
export const TIGHT_LINE_URL = "https://tightlinesoftware.com/"

/**
 * The Tight Line credit (Figma `DevelopedBy`, `465:17257`). Dark, at the
 * bottom of the editions panel; light on white, where the panel is hidden.
 * The logo links to Tight Line's site, in a new tab.
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
      <a
        href={TIGHT_LINE_URL}
        target="_blank"
        rel="noreferrer"
        className="rounded-sm transition-opacity duration-100 outline-none hover:opacity-80 focus-visible:ring-3 focus-visible:ring-ring"
      >
        <img
          src={dark ? tightLineLight : tightLine}
          alt="Tight Line (opens in a new tab)"
          width={96.727}
          height={16}
        />
      </a>
    </p>
  )
}
