/*
 * The words of Help. One list feeds both the tour card and the Help dialog,
 * so an area reads the same in each. A step covers only what works today:
 * add one here when a feature lands, and give its area a `data-tour` name.
 */

import { addKeyName } from "../map/click-selection"

export interface HelpStep {
  id: string
  title: string
  body: string
  /**
   * The `data-tour` names of the area, first one found wins. None means the
   * step is about the whole screen and its card sits in the middle.
   */
  targets: readonly string[]
  /** What the tour brings on screen first: the list, a selection, or the Agent panel. */
  needs?: "list" | "selection" | "agent"
}

export const HELP_STEPS: readonly HelpStep[] = [
  {
    id: "intro",
    title: "Welcome to Studio",
    body: "Here you check traced pipeline sections and record what is known about each, always with its source. Let us show you around.",
    targets: [],
  },
  {
    id: "sections",
    title: "The network",
    body: "The whole network: pipelines first, then sections in no pipeline yet. Select a row to see its sections on the right.",
    targets: ["sections"],
    needs: "list",
  },
  {
    id: "search",
    title: "Switch, search and filters",
    body: "Switch between everything, pipelines only, or sections in no pipeline. Search by name or code. The button beside the search opens the filters.",
    targets: ["list-tools"],
    needs: "list",
  },
  {
    id: "map",
    title: "The map",
    body: "Each line is a section: heavy in a pipeline, thin in none. Point at one for a quick summary.",
    targets: ["map"],
  },
  {
    id: "layers",
    title: "The map key",
    body: 'The map key says what each line means. "List follows the map", below it, keeps the list to what is in view.',
    targets: ["layers", "map"],
  },
  {
    id: "select",
    title: "Selecting",
    body: `Click a line to select it. Hold ${addKeyName()} and click to add more, or draw a loop with the Lasso.`,
    targets: ["tools", "map"],
  },
  {
    id: "claims",
    title: "Claims",
    body: "What is known about your selection. Click a claim to see its sources. Unknown, in orange, means no source yet.",
    targets: ["claims"],
    needs: "selection",
  },
  {
    id: "changes",
    title: "Making changes",
    body: "Right click a section or a pipeline to change it. Nothing changes until you save.",
    targets: ["claims"],
    needs: "selection",
  },
  {
    id: "agent",
    title: "Ask the Agent",
    body: 'Select something and press "Ask the Agent", or right click and choose Ask. The Agent answers on saved data; on this sample it cannot yet.',
    targets: ["ask-agent", "agent"],
    needs: "selection",
  },
  {
    id: "agent-panel",
    title: "Asking the Agent",
    body: "Ask in your own words. Every answer comes with its sources. Not sure what to ask? Press Tab to take the example in the box.",
    targets: ["agent-panel"],
    needs: "agent",
  },
  {
    id: "agent-cards",
    title: "The Agent's cards",
    body: "The Agent changes nothing by itself. A change or a search comes back as a card, and it waits for your press.",
    targets: ["agent-panel"],
    needs: "agent",
  },
  {
    id: "settings",
    title: "Help",
    body: "That is all. Help runs this tour again any time.",
    targets: ["settings"],
  },
]

export interface HelpWord {
  term: string
  meaning: string
}

/** The words a new reviewer meets on the screen. */
export const HELP_WORDS: readonly HelpWord[] = [
  {
    term: "Section",
    meaning:
      "A continuous stretch of line built and put in use at one time. Claims are made about sections.",
  },
  {
    term: "Pipeline",
    meaning:
      "One named system of pipe as a whole, made of one or more sections. Its name, owner and operator are claims on the pipeline, each for a period, not on its sections. A section is in a pipeline once a person has confirmed it.",
  },
  {
    term: "Claim",
    meaning:
      "One statement about one attribute of one section, such as its owner or its diameter.",
  },
  {
    term: "Citation",
    meaning:
      "The pointer to the source that supports a claim: the publication, issue and page, or the map.",
  },
  {
    term: "Edition",
    meaning:
      "One year's printing of the source map. A section is first seen on the earliest edition that shows it.",
  },
  {
    term: "Proposal",
    meaning:
      "A value a tool or the Agent suggests for a claim. It counts for nothing until a person decides.",
  },
  {
    term: "Finding",
    meaning:
      "What a search of the journals found for a claim: the page's own words. It is saved only when you press Propose, and then as a proposal.",
  },
  {
    term: "Unknown",
    meaning:
      "No source has been found for this yet. It is never filled in by guessing.",
  },
  {
    term: "Not started",
    meaning: "Neither Diameter nor Build date is cited.",
  },
  {
    term: "In progress",
    meaning: "One of Diameter and Build date is cited.",
  },
  {
    term: "Sufficient",
    meaning: "Diameter and Build date are both cited.",
  },
  { term: "Done", meaning: "Sufficient, and the section is in a pipeline." },
]
