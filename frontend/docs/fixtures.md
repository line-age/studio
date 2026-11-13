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
  "version": 2, // a version 1 file still loads
  "name": "Calder Valley network", // shown in the top bar
  "editions": [
    // the map editions, any order
    { "id": "ed-1937", "year": 1937, "label": "1937 edition" },
  ],

  "pipelines": [
    // list order is display order
    {
      "id": "p-012",
      "code": "P-012",
      "name": "Calder Valley", // or null: no source names it; it goes by its code
      "claims": [
        // optional: name, owner, operator; one claim per period
        {
          "attribute": "Owner",
          "value": "Calder Valley Gas Co.",
          "valid": "../1936",
          "citations": [
            {
              "source": "Plains Gas Review, 1936",
              "role": "states",
              "locator": "p. 214",
            },
          ],
        },
      ],
    },
  ],

  "sections": [
    {
      "id": "s-0142",
      "code": "S-0142",
      "name": "Harlow to Brecken", // or null: it goes by its code
      "pipelineId": "p-012", // confirmed only; null: in no pipeline
      "proposedMemberships": [
        // optional: a pipeline a tool proposes and nobody has confirmed
        // { "id": "pm-001", "pipelineId": "p-031", "score": 0.92, "proposer": "stitch" }
      ],
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
          "id": "c-0142-first-seen", // optional
          "attribute": "First seen",
          "value": "1937 edition",
          "valid": "../1937", // optional: the period, as the source gave it
          "citations": [
            {
              "source": "Trunk gas lines map, 1937",
              "role": "map_shows", // optional: what the source does for the claim
              "asOf": "1937", // optional: the date a map is as of
              "locator": "grid ref. F-7",
              "file": "traces/1937/base.gpkg", // optional: the trace file
            },
          ],
        },
      ],
      "proposedEnds": [
        // optional: an end or a cut a tool proposes; never applied
        {
          "id": "pe-001",
          "kind": "end", // or "cut"
          "otherSectionId": "gone-001", // the line traced as gone
          "score": 0.99,
          "proposer": "stitch", // optional: a tool, never a person
          "geometry": { "type": "LineString", "coordinates": [] },
          "citations": [], // the map that shows it, the map that does not
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

  "agentThread": [
    // optional: one static conversation
    {
      "kind": "user",
      "text": "What does store say about this?",
      "attachment": { "sectionId": "s-0142" },
    },
    {
      "kind": "assistant",
      "text": "Store holds these claims about Harlow to Brecken.",
      "statements": [
        // version 2: each statement with what it rests on
        {
          "text": "It is first seen on the 1937 edition.",
          "refs": [
            {
              "kind": "claim",
              "owner": "section",
              "ownerId": "s-0142",
              "attribute": "First seen",
            },
          ],
        },
        { "text": "Store does not say when it was built." }, // no refs: store has nothing
      ],
    },
  ],
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

## Evidence (version 2)

Everything here is optional, so a version 1 file still loads.

- A citation's `role` says what the source does for the claim: `map_shows`,
  `map_omits`, `states` or `confirms`. The screen says "Shown on", "Not on", "States",
  "Confirms".
- `asOf` is the date a map's content is as of, written as the source gives it:
  `"1953"`, `"1929-08"`. The screen shows "1953 edition, as of 31 December 1953". It is
  never a build date.
- `locator` is a place in the source (a page, a grid reference). The trace file a map
  reading was drawn in is not a place in the source; it goes in `file` and is shown
  last.
- A claim's `valid` is the period it holds for, as the source gave it: `"../1929-08"`
  (by August 1929), `"1929-08/1931"` (between August 1929 and 1931), `"1931/.."`
  (from 1931). The screen never shows it as a bare year.
- `id` on a claim, a citation or a proposal is the record's id where the data has one.
- `proposedEnds` on a section: a later map no longer shows all of it (`"end"`) or part
  of it (`"cut"`). The line traced as gone is not a section: it is in no list and no
  count, and is only its `geometry` and `citations` here. An end shows as a proposal on
  the section's `Last seen` claim and a cut on its `Geometry` claim, so the section
  needs those claims for the proposal to be seen. Last seen stays Unknown while an end
  is only proposed.

## Words

The types and the interface use the project glossary: **section**, **claim**,
**citation**. A removal (a line a later map no longer shows) is called "a line traced
as gone" on the screen. "Pipeline" (a named group of sections), "edition", "proposal" and
"Unknown" are Studio's words and are not in the glossary yet.

## Pipelines (version 2)

A pipeline's name, owner and operator are claims on the pipeline (`pipelines[].claims`),
each with its period, never on its sections. An owner that changed is two claims. A
section's `pipelineId` is the pipeline a person confirmed it part of; a proposal is in
`proposedMemberships` and changes nothing. A pipeline with no confirmed section, only
proposed ones, is a proposed pipeline. A section with no pipeline is in the Sections
list only. An `Owner` claim on a section is not read.

## Attributes the filters read

Attribute names are free text, but two of them drive filters:

- `Owner`, on a pipeline: the company. Its values are the choices under "Company"; a
  section has the companies of its pipeline, and search finds the pipeline by them.
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

Data that has only sections leaves `pipelines` empty and every `pipelineId` null. Studio
then opens on the Sections list, the sections under the edition that is the first to
show them, and the Pipelines list says there are none. This is how data read from the
Lineage store looks today; see "Real data from store" in the repo `README.md`.
