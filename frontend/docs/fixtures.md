# Fixture data

There is no API yet. The app reads one JSON file that describes a network:
its editions, pipelines, sections, what is known about each section and where
that is cited. This page is the format. `src/data/schema.ts` is the same thing
as code and is what the app checks a file against.

## Use your own file

1. Put the file in `public/fixtures/local/`, for example
   `public/fixtures/local/network.json`. That directory is ignored by git, so
   real names never reach the repository.
2. In `.env.local` set `VITE_FIXTURE_URL=/fixtures/local/network.json`.
3. Restart `pnpm dev`.

No code changes. If the file does not match the format, the app says which
field is wrong instead of starting.

Without `VITE_FIXTURE_URL` the app reads `public/fixtures/sample.json`, a small
invented network. Rebuild it with `pnpm fixtures:sample`. Only invented data is
committed.

## Shape

```jsonc
{
  "version": 1,
  "name": "Calder Valley network", // shown in the top bar
  "editions": [
    // the map editions, any order
    { "id": "ed-1937", "year": 1937, "label": "1937 edition" },
  ],

  "pipelines": [
    // list order is display order
    { "id": "p-012", "code": "P-012", "name": "Calder Valley" },
  ],

  "sections": [
    {
      "id": "s-0142",
      "code": "S-0142",
      "name": "Harlow to Brecken", // or null: it goes by its code
      "pipelineId": "p-012", // or null: not in a pipeline yet
      "editionIds": ["ed-1937"], // the editions that show it
      "geometry": {
        // GeoJSON, longitude then latitude
        "type": "LineString", // or "MultiLineString"
        "coordinates": [
          [-97.4, 36.28],
          [-97.05, 36.52],
        ],
      },
      "claims": [
        {
          "attribute": "Diameter",
          "value": null, // null is Unknown
          "citations": [],
          "proposals": [
            // what the AI proposes; never applied
            {
              "value": "12 in",
              "citation": {
                "source": "1937 edition",
                "locator": "grid ref. F-7",
                "quote": "\"12 IN.\"",
              },
            },
          ],
        },
        {
          "attribute": "First seen",
          "value": "1937 edition",
          "citations": [
            { "source": "1937 edition", "locator": "grid ref. F-7" },
          ],
        },
      ],
      "changedSinceReview": false, // optional
    },
  ],

  "proposedPaths": [
    // optional: dashed lines on the map
    {
      "id": "pp-001",
      "sectionId": "s-0142",
      "editionIds": ["ed-1937"],
      "geometry": { "type": "LineString", "coordinates": [] },
    },
  ],

  "notes": [
    // optional: numbered pins
    {
      "id": "n-001",
      "number": 1,
      "sectionId": "s-0142",
      "position": [-97.2, 36.4],
      "text": "The 1937 edition letters the diameter along this section.",
      "quote": "\"12 IN.\"",
      "source": "1937 edition, grid ref. F-7",
    },
  ],

  "agentThread": [], // optional: one static conversation
}
```

## Rules the app enforces

- A claim with a value needs at least one citation. Without a source the value
  is `null`, which the screen shows as Unknown. Never an empty string, a dash
  or a guess.
- An Unknown claim cannot carry citations. A proposal is how a candidate value
  and its source are recorded before a person decides.
- Ids are unique within their list. `pipelineId`, `editionIds` and `sectionId`
  must point at something that exists.
- Coordinates are WGS 84 degrees, longitude first, as in GeoJSON.
- Counts (sections per pipeline, claims cited, Unknown) are never stored. The
  app derives them, so they cannot disagree with the data.

## Words

The types and the interface use the project glossary: **section**, **claim**,
**citation**. "Pipeline" (a named group of sections), "edition", "proposal" and
"Unknown" are Studio's words and are not in the glossary yet.

## Attributes the filters read

Attribute names are free text, but two of them drive filters:

- `Owner`: the company. Its values are the choices under "Company", and search finds
  sections by it.
- `Build date`: the first four-digit year in the value is the build year for the
  "Build date" range. `"1934"` and `"Completed 1934"` both read as 1934.

A section where either is Unknown (`"value": null`) is left out when that filter is
set: Unknown is not a company and is in no range. The names are constants in
`src/data/derive.ts` (`COMPANY_ATTRIBUTE`, `BUILD_DATE_ATTRIBUTE`).

## When a record was added

A section may carry `"addedAt": "2026-11-12"`: the day its record was added to Lineage
(traced or imported), as an ISO day with no time. It is optional. The "Added to Lineage"
filter is a from-to range of days over it; a section without `addedAt` is left out
while that filter is set. This is not the build date and not the edition a line first
appears in; those are claims with sources.

## No pipelines yet

Data that has only sections leaves `pipelines` empty and every `pipelineId` null. The
list is then one group, "Not in a pipeline", with the sections under the edition that is
the first to show them. Nothing in the file says so: a section with a `pipelineId` goes
under its pipeline, any other under its first edition. This is how data read from the
Lineage store looks today; see "Real data from store" in the repo `README.md`.
