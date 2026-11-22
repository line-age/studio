import connectors from "./assets/connectors.svg"
import cited1929 from "./assets/1929-cited.svg"
import edge1929 from "./assets/1929-edge.svg"
import sheet1929 from "./assets/1929-sheet.svg"
import cited1947 from "./assets/1947-cited.svg"
import edge1947 from "./assets/1947-edge.svg"
import sheet1947 from "./assets/1947-sheet.svg"
import unknown1947 from "./assets/1947-unknown.svg"
import cited1965 from "./assets/1965-cited.svg"
import edge1965 from "./assets/1965-edge.svg"
import sheet1965 from "./assets/1965-sheet.svg"
import unknown1965 from "./assets/1965-unknown.svg"
import { DevelopedBy } from "./developed-by"

/*
 * The dark half of the sign-in page (Figma `433:16225`): three invented map
 * sheets, 1929, 1947 and 1965, on which a network grows. White lines are
 * cited, orange dotted ones Unknown. The drawing is decoration only: no
 * store data, hidden from assistive technology. The Tight Line credit sits
 * at the bottom. The whole panel is hidden on narrow screens. The layers are
 * Figma's own drawings, stacked in its order on an 864 by 1000 canvas.
 */

const LAYERS = [
  connectors,
  sheet1929,
  edge1929,
  cited1929,
  sheet1947,
  edge1947,
  cited1947,
  unknown1947,
  sheet1965,
  edge1965,
  cited1965,
  unknown1965,
]

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
        {LAYERS.map((src) => (
          <img
            key={src}
            src={src}
            alt=""
            className="absolute inset-0 size-full"
          />
        ))}
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
