import type {
  StoreFeature,
  StoreLink,
  StoreSectionRow,
} from "@/data/store/client"

/*
 * Invented answers shaped like store's, for tests. Two map sheets (1931 and
 * 1937) and three sections. Nothing here is a real line, sheet or person.
 */

const sheet = (year: number) => ({
  id: `cit-${year}`,
  role: "map_shows",
  locator: `traced in test/${year}`,
  quote: null,
  source_id: `sheet-${year}`,
  source_kind: "map_sheet",
  source_title: `Invented trunk line map, ${year}`,
  as_of_edtf: `${year}-06`,
  identifier: `invented-scan-${year}.tif`,
  confidence: null,
})

const route = (year: number, coordinates: number[][]) => ({
  id: `route-${year}-${coordinates[0].join("-")}`,
  attribute_key: "route",
  valid_edtf: `../${year}-06`,
  asserted_by: "agent-tracer",
  asserted_by_kind: "person",
  value_text: null,
  value_num: null,
  value_unit: null,
  value_geom: { type: "LineString", coordinates },
  status: "accepted",
  created_at: "2026-11-12T10:00:00Z",
  citations: [sheet(year)],
})

const operational = (year: number) => ({
  id: `status-${year}`,
  attribute_key: "status",
  valid_edtf: `../${year}-06`,
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
      links: [],
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
      links: [],
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
          citations: [
            {
              ...sheet(1937),
              role: "states",
              quote: '"12 IN."',
              confidence: 0.8,
            },
          ],
        },
        {
          attribute_key: "diameter",
          value_text: null,
          value_num: 16,
          value_unit: "in",
          value_geom: null,
          status: "candidate",
          created_at: "2026-11-12T12:00:00Z",
          citations: [{ ...sheet(1937), role: "states" }],
        },
        // Store may hold an owner on a section; Studio shows owners on the
        // pipeline only.
        {
          attribute_key: "owner",
          value_text: "Alder Gas Co.",
          value_num: null,
          value_unit: null,
          value_geom: null,
          status: "accepted",
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
      links: [],
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

/*
 * Lines traced as gone. Store keeps each as a section of its own, cited to the
 * map that shows it and to the next one, which does not. X runs along all of
 * A; Y along part of B; Z along all of C, and a person has confirmed that one.
 */
export const ID_X = "dddddddd-0000-4000-8000-000000000004"
export const ID_Y = "eeeeeeee-0000-4000-8000-000000000005"
export const ID_Z = "ffffffff-0000-4000-8000-000000000006"

const gone = (id: string, shown: number, omitted: number): StoreFeature => ({
  id,
  label: null,
  created_at: "2026-11-12T10:00:00Z",
  dates: { time_end: `${omitted}-12-31` },
  links: [],
  claims: [
    route(shown, [
      [0, 10],
      [1, 10],
    ]),
    {
      id: `gone-${id}`,
      attribute_key: "status",
      value_text: "decommissioned",
      value_num: null,
      value_unit: null,
      value_geom: null,
      valid_edtf: `${shown}-06/${omitted}`,
      status: "accepted",
      created_at: "2026-11-12T10:00:00Z",
      citations: [
        {
          ...sheet(omitted),
          role: "map_omits",
          as_of_edtf: String(omitted),
        },
      ],
    },
  ],
})

export function storeRemovals(): StoreFeature[] {
  return [
    gone(ID_X, 1931, 1937),
    gone(ID_Y, 1937, 1941),
    gone(ID_Z, 1931, 1937),
  ]
}

const link = (
  id: string,
  from: string,
  to: string,
  relation: string,
  status: string,
  score: number
): StoreLink => ({
  id,
  from_feature_id: from,
  to_feature_id: to,
  relation,
  status,
  score,
  asserted_by: "agent-stitch",
  asserted_by_name: "stitch",
})

export function storeLinks(): StoreLink[] {
  return [
    link("link-end", ID_X, ID_A, "same_as", "proposed", 0.986),
    link("link-cut", ID_Y, ID_B, "overlaps", "proposed", 0.75),
    link("link-confirmed", ID_Z, ID_C, "same_as", "confirmed", 1),
    // Not about a removal: Studio leaves it alone.
    link("link-other", ID_A, ID_B, "parallel_to", "proposed", 0.5),
  ]
}

/*
 * Lines: store's pipelines. L1 is named and its owner changed; a section is
 * proposed part of it and another confirmed. L2 has no claims and no label.
 */
export const LINE_1 = "11111111-0000-4000-8000-000000000011"
export const LINE_2 = "22222222-0000-4000-8000-000000000022"

const journal = (year: number, page: string) => ({
  id: `cit-journal-${year}`,
  role: "states",
  locator: page,
  quote: null,
  source_id: `journal-${year}`,
  source_kind: "issue",
  source_title: `Invented Gas Journal, ${year}`,
  as_of_edtf: null,
})

const said = (
  id: string,
  attribute_key: string,
  value_text: string,
  valid_edtf: string,
  year: number,
  status = "accepted"
) => ({
  id,
  attribute_key,
  value_text,
  value_num: null,
  value_unit: null,
  value_geom: null,
  valid_edtf,
  status,
  created_at: `2026-11-12T1${year % 10}:00:00Z`,
  citations: [journal(year, "p. 41")],
})

export function storeLines(): StoreFeature[] {
  return [
    {
      id: LINE_1,
      label: null,
      created_at: "2026-11-12T10:00:00Z",
      dates: null,
      links: [],
      claims: [
        said("l1-name", "name", "Alder trunk", "../1931", 1931),
        said("l1-owner-2", "owner", "Yew Fuel Co.", "1936/..", 1936),
        said("l1-owner-1", "owner", "Alder Gas Co.", "../1931", 1931),
        said(
          "l1-operator",
          "operator",
          "Alder Gas Co.",
          "../1931",
          1931,
          "candidate"
        ),
      ],
    },
    {
      id: LINE_2,
      label: null,
      created_at: "2026-11-12T10:00:00Z",
      dates: null,
      links: [],
      claims: [],
    },
  ]
}

/** A is confirmed part of L1; B is proposed for L2, C for L1. */
export function storeMemberships(): StoreLink[] {
  return [
    link("link-part-a", ID_A, LINE_1, "part_of", "confirmed", 1),
    link("link-part-b", ID_B, LINE_2, "part_of", "proposed", 0.7),
    link("link-part-c", ID_C, LINE_1, "part_of", "rejected", 0.2),
  ]
}
