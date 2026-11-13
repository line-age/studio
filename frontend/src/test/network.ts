import { parseNetwork, type Network } from "@/data/schema"

const line = (coordinates: [number, number][]) => ({
  type: "LineString" as const,
  coordinates,
})

const cited = (attribute: string, value: string) => ({
  attribute,
  value,
  citations: [{ source: "1937 edition", locator: "grid ref. A-1" }],
})

const unknown = (attribute: string) => ({ attribute, value: null })

/** A tiny invented network for tests: two pipelines and one loose section. */
export function testNetwork(): Network {
  return parseNetwork({
    version: 1,
    name: "Test network",
    editions: [
      { id: "ed-1931", year: 1931, label: "1931 edition" },
      { id: "ed-1937", year: 1937, label: "1937 edition" },
    ],
    pipelines: [
      { id: "p-1", code: "P-001", name: "North line" },
      { id: "p-2", code: "P-002", name: "South line" },
    ],
    sections: [
      {
        id: "s-1",
        code: "S-0001",
        name: "Alder to Birch",
        pipelineId: "p-1",
        editionIds: ["ed-1931", "ed-1937"],
        geometry: line([
          [0, 10],
          [1, 10],
        ]),
        claims: [cited("Owner", "Alder Gas Co."), cited("Diameter", "12 in")],
      },
      {
        id: "s-2",
        code: "S-0002",
        name: "Birch to Cedar",
        pipelineId: "p-1",
        editionIds: ["ed-1937"],
        geometry: line([
          [1, 10],
          [2, 11],
        ]),
        claims: [
          unknown("Owner"),
          {
            attribute: "Diameter",
            value: null,
            proposals: [
              { value: "8 in", citation: { source: "1937 edition" } },
            ],
          },
        ],
        changedSinceReview: true,
        addedAt: "2026-10-05",
      },
      {
        id: "s-3",
        code: "S-0003",
        name: "Dale to Elm",
        pipelineId: "p-2",
        editionIds: ["ed-1937"],
        geometry: line([
          [0, -10],
          [1, -10],
        ]),
        claims: [cited("Owner", "Alder Gas Co."), cited("Diameter", "6 in")],
      },
      {
        id: "s-4",
        code: "S-0004",
        name: "Unnamed section",
        pipelineId: null,
        editionIds: ["ed-1937"],
        geometry: line([
          [5, 5],
          [6, 5],
        ]),
        claims: [unknown("Owner")],
      },
      {
        id: "s-5",
        code: "S-0005",
        name: "Old route",
        pipelineId: "p-2",
        editionIds: ["ed-1931"],
        geometry: line([
          [0, -11],
          [1, -11],
        ]),
        claims: [unknown("Owner")],
      },
    ],
  })
}

/**
 * The test network with one more section, Fir to Gale: its route read off a
 * map, and an end a tool proposes because the next map leaves the line out.
 */
export function evidenceNetwork(): Network {
  const network = testNetwork()
  return parseNetwork({
    ...network,
    version: 2,
    sections: [
      ...network.sections,
      {
        id: "s-6",
        code: "S-0006",
        name: "Fir to Gale",
        pipelineId: "p-2",
        editionIds: ["ed-1931", "ed-1937"],
        geometry: line([
          [2, -10],
          [3, -10],
        ]),
        claims: [
          unknown("Owner"),
          unknown("Last seen"),
          {
            id: "c-6-geometry",
            attribute: "Geometry",
            value: "Traced line",
            valid: "../1931-06",
            citations: [
              {
                source: "Invented trunk map, 1931",
                role: "map_shows",
                asOf: "1931-06",
                file: "traces/1931/base.gpkg",
              },
            ],
          },
        ],
        proposedEnds: [
          {
            id: "pe-1",
            kind: "end",
            otherSectionId: "gone-1",
            score: 0.986,
            proposer: "stitch",
            geometry: line([
              [2, -10],
              [3, -10],
            ]),
            citations: [
              {
                source: "Invented trunk map, 1931",
                role: "map_shows",
                asOf: "1931-06",
              },
              {
                source: "Invented trunk map, 1937",
                role: "map_omits",
                asOf: "1937",
              },
            ],
          },
        ],
      },
    ],
  })
}
