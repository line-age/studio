/*
 * Writes public/fixtures/sample.json: a small, invented network in the
 * fixture format (docs/fixtures.md). Every name, place, company, source and
 * coordinate here is made up. Nothing is taken from a real map, trace or
 * spreadsheet. Run with `pnpm fixtures:sample`; the output is committed.
 */
import { writeFileSync } from "node:fs"
import { resolve } from "node:path"

const places = {
  "Marsh Fork": [-97.95, 36.62],
  "Calder Jct": [-97.62, 36.5],
  Harlow: [-97.4, 36.28],
  Brecken: [-97.05, 36.52],
  Wexley: [-96.82, 36.34],
  Adair: [-96.7, 36.1],
  Tolland: [-98.1, 36.2],
  Pell: [-97.8, 36.05],
  Dunmore: [-97.5, 35.95],
  Orrin: [-97.1, 35.9],
  Castell: [-96.55, 36.6],
  Venn: [-96.35, 36.42],
  Lowry: [-98.25, 36.75],
  Hask: [-98.0, 36.92],
  Sorrel: [-97.3, 36.88],
  Quill: [-96.9, 36.8],
  Tarn: [-96.4, 35.85],
  Ashby: [-96.1, 36.0],
  Merrow: [-95.9, 36.25],
  Coyle: [-95.75, 36.5],
  Fenn: [-98.4, 35.9],
  Garrick: [-98.55, 36.3],
}

const editions = [
  { id: "ed-1931", year: 1931, label: "1931 edition" },
  { id: "ed-1937", year: 1937, label: "1937 edition" },
]

const BOTH = ["ed-1931", "ed-1937"]
const LATER = ["ed-1937"]
const EARLIER = ["ed-1931"]

const pipelines = [
  { id: "p-012", code: "P-012", name: "Calder Valley" },
  { id: "p-013", code: "P-013", name: "Tolland" },
  { id: "p-014", code: "P-014", name: "Adair trunk" },
  { id: "p-015", code: "P-015", name: "Wexley lateral" },
  { id: "p-016", code: "P-016", name: "Marsh Fork gathering" },
  { id: "p-017", code: "P-017", name: "Brecken loop" },
  { id: "p-041", code: "P-041", name: "Harlow lateral" },
]

const round = (n) => Math.round(n * 1e5) / 1e5

/** A line from a to b with one or two bends, the same every run. */
function path(from, to, bend = 0.04, points = 1) {
  const [x1, y1] = places[from] ?? from
  const [x2, y2] = places[to] ?? to
  const dx = x2 - x1
  const dy = y2 - y1
  const out = [[x1, y1]]
  for (let i = 1; i <= points; i += 1) {
    const t = i / (points + 1)
    const side = i % 2 === 0 ? -1 : 1
    out.push([
      round(x1 + dx * t - dy * bend * side),
      round(y1 + dy * t + dx * bend * side),
    ])
  }
  out.push([x2, y2])
  return { type: "LineString", coordinates: out }
}

const yearOf = (editionId) => editions.find((e) => e.id === editionId).year

/** A map edition that shows the line (or, with `role`, leaves it out). */
const mapSource = (editionId, locator, role = "map_shows") => ({
  source: `Trunk gas lines map, ${yearOf(editionId)}`,
  role,
  asOf: String(yearOf(editionId)),
  ...(locator ? { locator } : {}),
})

const JOURNAL = { source: "Plains Gas Review, 1936", role: "states" }

/**
 * The six claims of a section. `unknown` lists the attributes nobody has a
 * source for; those get value null and no citation.
 */
function claims({
  code,
  editionIds,
  grid,
  owner,
  diameter,
  built,
  points,
  unknown = [],
}) {
  const first = editionIds[0]
  const last = editionIds[editionIds.length - 1]
  const label = (id) => editions.find((e) => e.id === id).label
  const id = (attribute) =>
    `c-${code.toLowerCase()}-${attribute.toLowerCase().replace(" ", "-")}`
  const known = (attribute, value, citations, valid) =>
    unknown.includes(attribute)
      ? {
          id: id(attribute),
          attribute,
          value: null,
          citations: [],
          proposals: [],
        }
      : {
          id: id(attribute),
          attribute,
          value,
          ...(valid ? { valid } : {}),
          citations,
          proposals: [],
        }
  return [
    known(
      "Owner",
      owner,
      [{ ...JOURNAL, locator: "p. 214", quote: `operated by the ${owner}` }],
      "../1936"
    ),
    known("Diameter", diameter, [
      {
        ...mapSource(last, `grid ref. ${grid}`, "states"),
        quote: `"${diameter.toUpperCase()}."`,
      },
    ]),
    known("First seen", label(first), [mapSource(first, `grid ref. ${grid}`)]),
    known("Last seen", label(last), [mapSource(last, `grid ref. ${grid}`)]),
    known("Build date", built, [{ ...JOURNAL, locator: "p. 215" }]),
    known(
      "Geometry",
      `${points} points, traced`,
      [
        {
          ...mapSource(last, `grid ref. ${grid}`),
          file: `traces/${yearOf(last)}/base.gpkg`,
        },
      ],
      `../${yearOf(last)}`
    ),
  ]
}

let serial = 139
const sections = []

/** An invented day each record was added: spread over ten weeks from 1 Sept 2026. */
function addedDay(index) {
  const day = new Date(Date.UTC(2026, 8, 1 + ((index * 5) % 70)))
  return day.toISOString().slice(0, 10)
}

function add(pipelineId, name, from, to, options = {}) {
  serial += 1
  const editionIds = options.editionIds ?? LATER
  const geometry =
    options.geometry ?? path(from, to, options.bend, options.points)
  const code = `S-${String(serial).padStart(4, "0")}`
  const section = {
    id: `s-${String(serial).padStart(4, "0")}`,
    code,
    name,
    pipelineId,
    editionIds,
    geometry,
    claims: claims({
      code,
      editionIds,
      grid: options.grid ?? "F-7",
      owner: options.owner ?? "Calder Valley Gas Co.",
      diameter: options.diameter ?? "12 in",
      built: options.built ?? "1934",
      points: geometry.coordinates.length,
      unknown: options.unknown,
    }),
    changedSinceReview: options.changed ?? false,
    addedAt: addedDay(sections.length),
  }
  sections.push(section)
  return section
}

// P-012 Calder Valley: six sections, four Unknown claims, one proposal, one note.
add("p-012", "Marsh Fork to Calder Jct", "Marsh Fork", "Calder Jct", {
  editionIds: BOTH,
  grid: "D-5",
})
add("p-012", "Marsh Fork to Harlow", "Marsh Fork", "Harlow", {
  grid: "D-6",
  bend: -0.08,
  points: 2,
})
const harlowBrecken = add("p-012", "Harlow to Brecken", "Harlow", "Brecken", {
  grid: "F-7",
  unknown: ["Owner", "Diameter", "Build date"],
  changed: true,
})
harlowBrecken.claims
  .find((c) => c.attribute === "Diameter")
  .proposals.push({
    value: "12 in",
    id: "c-s-0142-diameter-candidate",
    citation: {
      ...mapSource("ed-1937", "grid ref. F-7", "states"),
      quote: '"12 IN."',
    },
  })
add("p-012", "Calder Jct to Wexley", "Calder Jct", "Wexley", {
  editionIds: BOTH,
  grid: "E-6",
  bend: 0.1,
  points: 2,
})
add("p-012", "Wexley to Adair", "Wexley", "Adair", {
  grid: "G-8",
  unknown: ["Build date"],
})
add("p-012", "Adair spur", "Adair", [-96.52, 36.18], {
  grid: "G-9",
  diameter: "8 in",
})

// P-013 Tolland: four sections, five Unknown claims.
const tolland = { owner: "Tolland Fuel Co.", diameter: "10 in", built: "1929" }
/*
 * A line traced as gone between the two editions: the 1931 map shows it, the
 * 1937 map does not. It is no section of its own; it hangs on the section it
 * runs along, as an end or a cut that a tool proposes and nobody has decided.
 */
const tracedAsGone = (grid) => [
  {
    ...mapSource("ed-1931", `grid ref. ${grid}`),
    file: "traces/1931/base.gpkg",
  },
  {
    ...mapSource("ed-1937", `grid ref. ${grid}`, "map_omits"),
    file: "traces/1931_1937/removed.gpkg",
  },
]

// Proposed to end: the whole section is traced as gone. Last seen stays
// Unknown until a person confirms it.
const tollandPell = add("p-013", "Tolland to Pell", "Tolland", "Pell", {
  ...tolland,
  editionIds: BOTH,
  grid: "B-8",
  unknown: ["Owner", "Last seen"],
})
tollandPell.proposedEnds = [
  {
    id: "pe-001",
    kind: "end",
    otherSectionId: "gone-001",
    score: 0.99,
    proposer: "stitch",
    geometry: path("Tolland", "Pell", 0.05),
    citations: tracedAsGone("B-8"),
  },
]
// Proposed to be cut: part of the section is traced as gone.
const pellDunmore = add("p-013", "Pell to Dunmore", "Pell", "Dunmore", {
  ...tolland,
  editionIds: BOTH,
  grid: "C-9",
  unknown: ["Owner", "Build date"],
})
pellDunmore.proposedEnds = [
  {
    id: "pe-002",
    kind: "cut",
    otherSectionId: "gone-002",
    score: 0.75,
    proposer: "stitch",
    geometry: path("Pell", [-97.66, 36.01], 0.03),
    citations: tracedAsGone("C-9"),
  },
]
add("p-013", "Dunmore to Orrin", "Dunmore", "Orrin", {
  ...tolland,
  grid: "E-10",
  unknown: ["Diameter"],
})
add("p-013", "Tolland spur", "Tolland", "Garrick", {
  ...tolland,
  grid: "A-7",
  unknown: ["Build date"],
})

// P-014 Adair trunk: nine sections, every claim cited.
const trunk = {
  owner: "Harlow Gas Co.",
  diameter: "16 in",
  built: "1930",
  editionIds: BOTH,
}
const trunkStops = ["Orrin", "Tarn", "Ashby", "Merrow", "Coyle"]
add("p-014", "Adair to Orrin", "Adair", "Orrin", {
  ...trunk,
  owner: "Adair Pipe Line Co.",
  grid: "F-10",
  points: 2,
})
for (let i = 0; i < trunkStops.length - 1; i += 1) {
  add(
    "p-014",
    `${trunkStops[i]} to ${trunkStops[i + 1]}`,
    trunkStops[i],
    trunkStops[i + 1],
    {
      ...trunk,
      owner: i < 2 ? "Harlow Gas Co." : "Adair Pipe Line Co.",
      grid: `H-${10 - i}`,
    }
  )
}
add("p-014", "Adair to Tarn", "Adair", "Tarn", {
  ...trunk,
  owner: "Adair Pipe Line Co.",
  grid: "G-10",
  bend: -0.1,
})
add("p-014", "Coyle to Venn", "Coyle", "Venn", {
  ...trunk,
  owner: "Adair Pipe Line Co.",
  grid: "J-6",
  editionIds: LATER,
})
add("p-014", "Venn to Castell", "Venn", "Castell", {
  ...trunk,
  owner: "Adair Pipe Line Co.",
  grid: "I-5",
  editionIds: LATER,
})
add("p-014", "Merrow spur", "Merrow", [-95.7, 36.12], {
  ...trunk,
  owner: "Adair Pipe Line Co.",
  grid: "K-8",
  diameter: "8 in",
})

// P-015 Wexley lateral: two sections, eight Unknown claims.
const allButSeen = ["Owner", "Diameter", "Build date", "Geometry"]
add("p-015", "Wexley to Castell", "Wexley", "Castell", {
  grid: "H-6",
  unknown: allButSeen,
})
add("p-015", "Wexley to Venn", "Wexley", "Venn", {
  grid: "I-7",
  unknown: allButSeen,
  bend: -0.06,
})

// P-016 Marsh Fork gathering: five sections, four Unknown claims.
const gathering = {
  owner: "Marsh Fork Gathering Co.",
  diameter: "6 in",
  built: "1935",
}
add("p-016", "Lowry to Marsh Fork", "Lowry", "Marsh Fork", {
  ...gathering,
  grid: "B-4",
  unknown: ["Build date"],
})
add("p-016", "Hask to Marsh Fork", "Hask", "Marsh Fork", {
  ...gathering,
  grid: "C-3",
  unknown: ["Diameter"],
})
add("p-016", "Hask to Sorrel", "Hask", "Sorrel", {
  ...gathering,
  grid: "D-3",
  points: 2,
})
add("p-016", "Lowry to Hask", "Lowry", "Hask", {
  ...gathering,
  grid: "B-3",
  unknown: ["Owner"],
})
add("p-016", "Garrick to Lowry", "Garrick", "Lowry", {
  ...gathering,
  grid: "A-5",
  unknown: ["Build date"],
  bend: 0.08,
})

// P-017 Brecken loop: three sections, every claim cited.
const loop = {
  owner: "Brecken Light and Fuel Co.",
  diameter: "8 in",
  built: "1933",
}
add("p-017", "Brecken to Quill", "Brecken", "Quill", { ...loop, grid: "F-4" })
add("p-017", "Quill to Sorrel", "Quill", "Sorrel", { ...loop, grid: "E-3" })
add("p-017", "Sorrel to Brecken", "Sorrel", "Brecken", {
  ...loop,
  grid: "E-4",
  bend: -0.1,
})

// P-041 Harlow lateral: three sections to the south-west.
serial = 409
const lateral = { owner: "Harlow Gas Co.", diameter: "8 in", built: "1936" }
add("p-041", "Harlow to Dunmore", "Harlow", "Dunmore", {
  ...lateral,
  grid: "E-8",
})
add("p-041", "Dunmore to Fenn", "Dunmore", "Fenn", {
  ...lateral,
  grid: "B-10",
  points: 2,
  unknown: ["Build date"],
})
add("p-041", "Harlow to Pell", "Harlow", "Pell", {
  ...lateral,
  grid: "D-8",
  bend: -0.05,
})

// Sections that are in no pipeline yet.
serial = 899
const loose = ["Owner", "Diameter", "Build date"]
add(null, "Unnamed section near Castell", "Castell", "Coyle", {
  grid: "J-5",
  unknown: loose,
})
add(null, "Unnamed section near Quill", "Quill", "Castell", {
  grid: "G-4",
  unknown: loose,
  bend: 0.07,
})
add(null, "Unnamed section near Fenn", "Fenn", "Tolland", {
  grid: "A-9",
  unknown: [...loose, "Geometry"],
})
add(null, "Unnamed section near Orrin", "Orrin", [-97.25, 35.72], {
  grid: "E-11",
  unknown: loose,
})

// Sections only the earlier edition shows. Drawn as ghosts under 1937.
// An end a person has confirmed: Last seen is cited to both maps.
const earlierRoute = add(
  "p-012",
  "Harlow to Brecken, earlier route",
  "Harlow",
  "Brecken",
  {
    editionIds: EARLIER,
    grid: "F-7",
    bend: -0.16,
    points: 2,
    unknown: ["Owner", "Diameter", "Build date"],
  }
)
Object.assign(
  earlierRoute.claims.find((c) => c.attribute === "Last seen"),
  {
    value: "1931 edition, not on 1937",
    valid: "1931/1937",
    citations: tracedAsGone("F-7").map(({ file: _file, ...c }) => c),
  }
)
add(null, "Unnamed section near Dunmore", "Dunmore", [-97.3, 36.1], {
  editionIds: EARLIER,
  grid: "E-9",
  unknown: loose,
})

const [hx, hy] = places.Harlow
const [bx, by] = places.Brecken

const network = {
  version: 2,
  name: "Calder Valley network",
  editions,
  pipelines,
  sections,
  proposedPaths: [
    {
      id: "pp-001",
      sectionId: harlowBrecken.id,
      editionIds: LATER,
      geometry: {
        type: "LineString",
        coordinates: [
          [hx, hy],
          [round(hx + 0.1), round(by + 0.02)],
          [bx, by],
        ],
      },
    },
  ],
  notes: [
    {
      id: "n-001",
      number: 1,
      sectionId: harlowBrecken.id,
      position: harlowBrecken.geometry.coordinates[1],
      text: "The 1937 edition letters the diameter along this section.",
      quote: '"12 IN."',
      source: "Trunk gas lines map, 1937, grid ref. F-7",
    },
  ],
  agentThread: [
    { kind: "marker", text: "12 Nov 2026", separator: true },
    {
      kind: "user",
      text: "Find a source for the diameter of this section.",
      attachment: { sectionId: harlowBrecken.id, attribute: "Diameter" },
    },
    { kind: "marker", text: "Read the 1937 and 1931 editions" },
    {
      kind: "assistant",
      text: "One edition states it. The other shows the line with no lettering.",
      noteIds: ["n-001"],
      proposal: { sectionId: harlowBrecken.id, attribute: "Diameter" },
    },
    { kind: "marker", text: "Nothing has been changed." },
  ],
}

const out = resolve(import.meta.dirname, "../public/fixtures/sample.json")
writeFileSync(out, `${JSON.stringify(network, null, 2)}\n`)
console.log(
  `wrote ${out}: ${pipelines.length} pipelines, ${sections.length} sections`
)
