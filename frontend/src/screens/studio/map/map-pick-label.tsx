/**
 * While picking on the map, beside the pointer (Figma `482:19090`): which
 * section, where it is now, and what a click does.
 */
export function MapPickLabel({
  section,
  where,
  click,
  x,
  y,
}: {
  /** "U-a · Calder Jct to Dunmore". */
  section: string
  /** "In no pipeline", "In Tolland", "Picked". */
  where: string
  /** "click to add", "click to remove", "click to take it off". */
  click: string
  /** The pointer, in the map's pixels. */
  x: number
  y: number
}) {
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-10 flex max-w-64 flex-col gap-0.5 rounded-md border bg-popover px-2 py-1.5 shadow-popover"
      style={{ left: x + 14, top: y + 14 }}
    >
      <span className="truncate type-ui-xs-medium">{section}</span>
      <span className="type-ui-xs text-muted-foreground">
        {where} · {click}
      </span>
    </div>
  )
}
