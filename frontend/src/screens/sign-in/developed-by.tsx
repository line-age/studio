import tightLine from "./assets/tight-line.svg"

/** The credit under the sign-in form (Figma `439:16211`). */
export function DevelopedBy() {
  return (
    <p className="flex items-center gap-2.5 type-ui-xs text-muted-foreground">
      Developed by
      <img src={tightLine} alt="Tight Line" width={96.727} height={16} />
    </p>
  )
}
