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

export function storeFeatures(): StoreFeature[] {
  const removals = new Map(storeRemovals().map((f) => [f.id, f]))
  const features: Omit<StoreFeature, "inherited_claims">[] = [
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
  // C has Z's claims through the link a person confirmed: its history.
  return features.map((f) => ({
    ...f,
    inherited_claims:
      f.id === ID_C
        ? removals
            .get(ID_Z)!
            .claims.map((c) => ({ ...c, inherited_from: ID_Z }))
        : [],
  }))
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
  inherited_claims: [],
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
  asserted_by_kind: "pipeline",
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
      inherited_claims: [],
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
      inherited_claims: [],
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

/*
 * Store's list rows for invented features, worked out the way store does
 * (store's reads.section_summaries): the accepted claims with a citation,
 * own and inherited, newest first; cited candidates; the years of the sheets
 * that show the route; the year of the sheet a confirmed removal is not on.
 * B is drawn twice: a proposed cut makes it a piece of its own.
 */
export function rowsFor(
  features: readonly StoreFeature[],
  links: readonly StoreLink[] = []
): StoreSectionRow[] {
  const year = (s: string | null | undefined) => {
    const y = s?.match(/\d{4}/)?.[0]
    return y ? Number(y) : null
  }
  return features.flatMap((f) => {
    const scope = [
      ...f.claims.map((c) => ({ c, from: null as string | null })),
      ...f.inherited_claims.map((c) => ({ c, from: c.inherited_from ?? null })),
    ]
    const accepted: StoreSectionRow["accepted"] = {}
    for (const { c, from } of [...scope].sort((a, b) =>
      (b.c.created_at ?? "").localeCompare(a.c.created_at ?? "")
    )) {
      if (c.status !== "accepted" || c.citations.length === 0) continue
      if (c.attribute_key === "route" && !c.value_geom) continue
      const shows = c.citations
        .filter(
          (x) =>
            x.role === "map_shows" &&
            x.source_kind === "map_sheet" &&
            x.as_of_edtf
        )
        .map((x) => x.as_of_edtf!)
        .sort()
      ;(accepted[c.attribute_key] ??= []).push({
        claim_id: c.id ?? `${f.id}-${c.attribute_key}`,
        value_text: c.value_text ?? null,
        value_num: c.value_num ?? null,
        value_unit: c.value_unit ?? null,
        valid_edtf: c.valid_edtf ?? null,
        created_at: c.created_at ?? null,
        shown_as_of: shows[0] ?? null,
        inherited_from: from,
      })
    }
    const candidates: Record<string, number> = {}
    for (const c of f.claims) {
      const valued =
        Boolean(c.value_text) || c.value_num != null || Boolean(c.value_geom)
      if (c.status !== "candidate" || !valued || c.citations.length === 0)
        continue
      candidates[c.attribute_key] = (candidates[c.attribute_key] ?? 0) + 1
    }
    const route = f.claims
      .filter((c) => c.attribute_key === "route" && c.status === "accepted")
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0]
    const shown_years = [
      ...new Set(
        (route?.citations ?? []).flatMap((x) =>
          x.role === "map_shows" &&
          x.source_kind === "map_sheet" &&
          year(x.as_of_edtf) !== null
            ? [year(x.as_of_edtf)!]
            : []
        )
      ),
    ].sort((a, b) => a - b)
    const goneYears = scope.flatMap(({ c, from }) =>
      from !== null &&
      c.attribute_key === "status" &&
      c.status === "accepted" &&
      c.value_text === "decommissioned"
        ? c.citations.flatMap((x) =>
            x.role === "map_omits" &&
            x.source_kind === "map_sheet" &&
            year(x.as_of_edtf) !== null
              ? [year(x.as_of_edtf)!]
              : []
          )
        : []
    )
    const cuts = links.filter(
      (l) =>
        l.relation === "overlaps" &&
        l.status === "proposed" &&
        l.to_feature_id === f.id
    )
    const confirmedEnd = f.dates?.time_end ?? null
    const row = (row_id: string): StoreSectionRow => ({
      row_id,
      section_id: f.id,
      label: f.label ?? null,
      line_id: null,
      time_end: confirmedEnd,
      end_status: confirmedEnd ? "confirmed" : null,
      accepted,
      candidates,
      shown_years,
      gone_year: goneYears.length > 0 ? Math.min(...goneYears) : null,
      created_at: f.created_at ?? null,
      geometry: route?.value_geom ?? null,
      ...(cuts.length > 0 ? { whole_route: route?.value_geom ?? null } : {}),
    })
    return [row(f.id), ...cuts.map((l) => row(l.id))]
  })
}

/** The rows of the three invented sections, B cut in two. */
export function storeRows(): StoreSectionRow[] {
  return rowsFor(storeFeatures(), storeLinks())
}
