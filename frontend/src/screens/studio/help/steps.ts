/*
 * The words of Help. One list feeds both the tour card and the Help dialog,
 * so an area reads the same in each. A step covers only what works today:
 * add one here when a feature lands, and give its area a `data-tour` name.
 */

export interface HelpStep {
  id: string
  title: string
  body: string
  /**
   * The `data-tour` names of the area, first one found wins. None means the
   * step is about the whole screen and its card sits in the middle.
   */
  targets: readonly string[]
  /** What the tour brings on screen first: the Sections list, a selection, or the Agent panel. */
  needs?: "list" | "selection" | "agent"
}

export const HELP_STEPS: readonly HelpStep[] = [
  {
    id: "intro",
    title: "What Studio is",
    body: "Studio is where you check traced pipeline sections. Everything said about a section is a claim. A claim is cited, with the source that says so, or it is Unknown. Nothing is filled in by guessing.",
    targets: [],
  },
  {
    id: "sections",
    title: "Pipelines and Sections",
    body: "Two lists, each with its own place in the rail. Pipelines lists the pipelines, then the ones only proposed. Sections lists every section that was traced, in a pipeline or not, by the edition that first shows it. The counts at the top say how many sections of the whole edition are at each status; moving the map does not change them.",
    targets: ["sections"],
    needs: "list",
  },
  {
    id: "search",
    title: "Edition, search and filters",
    body: "The select at the top sets the edition: Studio shows the network as of that year. Type to narrow the list; the button beside the search opens the filters. Press / to jump to the search from anywhere.",
    targets: ["list-tools"],
    needs: "list",
  },
  {
    id: "map",
    title: "The map",
    body: "Each line is a section. A line is solid or dotted by its status. Drag to move the map and scroll to zoom.",
    targets: ["map"],
  },
  {
    id: "layers",
    title: "Map layers",
    body: 'The layers button says how each status is drawn and chooses what is on the map. "List follows the map", below it, keeps the list to the sections in view; while the list is a table it waits.',
    targets: ["layers", "map"],
  },
  {
    id: "select",
    title: "Selecting",
    body: "Click a line to select it; click it again to take it off. Tick rows in the list, or draw a loop with the Lasso, to select several. A selection can span pipelines.",
    targets: ["tools", "map"],
  },
  {
    id: "claims",
    title: "Claims",
    body: "What is selected shows here, claim by claim. Click a section to read it; that does not change what is selected. A cited value comes with its source. Unknown, the orange word with a dotted underline, means no source has been found yet. A proposal is a value the AI suggests and nobody has decided on.",
    targets: ["claims"],
    needs: "selection",
  },
  {
    id: "agent",
    title: "Ask the Agent",
    body: '"Ask the Agent" hands what you selected to the Agent as references. It shows on the map after a selection made there, and the Agent is always in the rail. The Agent does not answer yet.',
    targets: ["ask-agent", "agent"],
    needs: "selection",
  },
  {
    id: "agent-panel",
    title: "Asking the Agent",
    body: "The sections you handed over sit with your message as attachments; type # to add another. You can write the message, but nothing is sent yet.",
    targets: ["agent-panel"],
    needs: "agent",
  },
  {
    id: "settings",
    title: "Settings and Help",
    body: "Settings decides which attributes a section needs cited to have sufficient data, and how each status is drawn on the map. Help opens these pages and this tour again.",
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
    meaning: "A year. Studio shows the network as of the edition chosen.",
  },
  {
    term: "Proposal",
    meaning:
      "A value the AI suggests for a claim. It counts for nothing until a person decides.",
  },
  {
    term: "Unknown",
    meaning:
      "No source has been found for this yet. It is never filled in by guessing.",
  },
  {
    term: "Not started",
    meaning: "None of the attributes required in Settings is cited.",
  },
  {
    term: "In progress",
    meaning: "Some of the required attributes are cited.",
  },
  {
    term: "Sufficient",
    meaning: "Every required attribute is cited.",
  },
  { term: "Done", meaning: "Sufficient, and the section is in a pipeline." },
]
