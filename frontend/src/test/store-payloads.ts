import type { StoreFeature, StoreSectionRow } from "@/data/store/client"

/*
 * Invented answers shaped like store's, for tests. Two map sheets (1931 and
 * 1937) and three sections. Nothing here is a real line, sheet or person.
 */

const sheet = (year: number) => ({
  role: "map_shows",
  locator: `traced in test/${year}`,
  quote: null,
  source_id: `sheet-${year}`,
  source_kind: "map_sheet",
  source_title: `Invented trunk line map, ${year}`,
  as_of_edtf: `${year}-06`,
})

const route = (year: number, coordinates: number[][]) => ({
  attribute_key: "route",
  value_text: null,
  value_num: null,
  value_unit: null,
  value_geom: { type: "LineString", coordinates },
  status: "accepted",
  created_at: "2026-11-12T10:00:00Z",
  citations: [sheet(year)],
})

const operational = (year: number) => ({
  attribute_key: "status",
  value_text: "operational",
  value_num: null,
  value_unit: null,
  value_geom: null,
  status: "accepted",
  created_at: "2026-11-12T10:00:00Z",
  citations: [sheet(year)],
})

export const ID_A = "aaaaaaaa-0000-4000-8000-000000000001"
export const ID_B = "bbbbbbbb-0000-4000-8000-000000000002"
export const ID_C = "cccccccc-0000-4000-8000-000000000003"

export function storeRows(): StoreSectionRow[] {
  // B comes twice: store draws a proposed cut piece as its own row.
  return [ID_A, ID_B, ID_B, ID_C].map((section_id) => ({
    section_id,
    line_id: null,
  }))
}

export function storeFeatures(): StoreFeature[] {
  return [
    {
      id: ID_A,
      label: null,
      created_at: "2026-11-12T10:00:00Z",
      dates: { time_end: null },
      claims: [
        route(1931, [
          [0, 10, 0],
          [1, 10, 0],
        ]),
        operational(1931),
      ],
    },
    {
      id: ID_B,
      label: null,
      created_at: "2026-11-12T10:00:00Z",
      dates: { time_end: null },
      claims: [
        route(1937, [
          [1, 10],
          [2, 11],
        ]),
        operational(1937),
        {
          attribute_key: "diameter",
          value_text: null,
          value_num: 12,
          value_unit: "in",
          value_geom: null,
          status: "accepted",
          created_at: "2026-11-12T11:00:00Z",
          citations: [{ ...sheet(1937), role: "states", quote: '"12 IN."' }],
        },
        {
          attribute_key: "owner",
          value_text: "Alder Gas Co.",
          value_num: null,
          value_unit: null,
          value_geom: null,
          status: "candidate",
          created_at: "2026-11-12T12:00:00Z",
          citations: [{ ...sheet(1937), role: "states" }],
        },
      ],
    },
    {
      id: ID_C,
      label: "Dale to Elm",
      created_at: null,
      dates: { time_end: "1934-01-01" },
      claims: [
        route(1931, [
          [0, -10],
          [1, -10],
        ]),
        operational(1931),
      ],
    },
  ]
}
