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
  /** What the tour brings on screen first: the list, a selection, or the Agent panel. */
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
    title: "The network",
    body: "One list of every section that was traced, grouped the way you choose with Group by. By edition: one row for each map edition, with the sections it is the first to show. By pipeline: the pipelines, then the ones only proposed, then the sections in no pipeline. Select a row and its sections are listed on the right.",
    targets: ["sections"],
    needs: "list",
  },
  {
    id: "search",
    title: "Group by, search and filters",
    body: "Group by changes the rows, not what is shown. Type a name or a code to narrow the list. The button beside the search opens the filters: status, pipeline, first seen, state, company, diameter, build date and more. The ones that are on show as chips under the search. Press / to jump to the search from anywhere.",
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
    title: "The map key",
    body: 'The map key says how each line is drawn. Its two eyes show or hide the paths a tool proposed and, faint, the sections the filters leave out. "List follows the map", below it, keeps the list to the sections in view; while the list is a table it waits.',
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
    body: '"Ask the Agent" hands what you selected to the Agent as references. It shows on the map after a selection made there, and the Agent is always in the rail. Right click a section, a claim, a source or a proposal to ask about it: "What does store say about this?", "Why is this Unknown?", "What is proposed here, and why?", and on a section "What surrounds this section?" and "What could we look for here?". On store\'s data the Agent answers; on the sample it cannot yet.',
    targets: ["ask-agent", "agent"],
    needs: "selection",
  },
  {
    id: "agent-panel",
    title: "Asking the Agent",
    body: 'What you handed over sits with your message as attachments; a starter question puts its words in the box, and you can change them. An answer shows what the Agent read above it, each statement\'s source beside it and sections as links; click any to open it. "Worked out" marks what the Agent worked out itself, and "Lead, not in store" marks where to look next: neither is a claim. On the sample, a question stays here with a line that says the Agent cannot answer yet.',
    targets: ["agent-panel"],
    needs: "agent",
  },
  {
    id: "settings",
    title: "Settings and Help",
    body: "Settings decides which attributes a section needs cited to have sufficient data, and how each status is drawn on the map. Help runs this tour again, opens the Agent to ask a question, and has a page on each area.",
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
