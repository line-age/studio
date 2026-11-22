import editions from "./assets/editions.svg"
import { DevelopedBy } from "./developed-by"

/*
 * The dark half of the sign-in page (Figma `433:16225`): three invented map
 * sheets, 1929, 1947 and 1965, on which a network grows. White lines are
 * cited, orange dotted ones Unknown. The drawing is decoration only: no
 * store data, hidden from assistive technology. The Tight Line credit sits
 * at the bottom. The whole panel is hidden on narrow screens. The drawing is
 * Figma's own, exported as one SVG on its 864 by 1000 canvas.
 */

/** Where each year is written, as a share of the canvas's height. */
const YEARS = [
  { year: 1965, top: "23.7%" },
  { year: 1947, top: "48.7%" },
  { year: 1929, top: "73.7%" },
]

export function EditionsPanel() {
  return (
    <div className="relative flex-1 overflow-hidden bg-topbar text-topbar-foreground max-md:hidden">
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-1/2 aspect-[864/1000] -translate-x-1/2"
      >
        <img src={editions} alt="" className="absolute inset-0 size-full" />
        {YEARS.map(({ year, top }) => (
          <span
            key={year}
            className="absolute left-[10.9%] type-ui-mono-xs opacity-70"
            style={{ top }}
          >
            {year}
          </span>
        ))}
      </div>
      <div className="absolute inset-x-0 bottom-10.5 flex justify-center">
        <DevelopedBy surface="dark" />
      </div>
    </div>
  )
}
