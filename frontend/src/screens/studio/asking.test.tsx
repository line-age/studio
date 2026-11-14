import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { parseNetwork } from "@/data/schema"
import { evidenceNetwork } from "@/test/network"

import { useSettings } from "./settings"
import { StudioScreen } from "./studio-screen"
import { useCamera, useStudio } from "./studio-store"

/*
 * Asking the Agent about what is on screen. Every question only reads; the
 * Agent does not answer yet, and the chat says so. An answer in the data
 * shows what each statement rests on, and a click opens it.
 */

const answered = () => {
  const network = evidenceNetwork()
  return parseNetwork({
    ...network,
    agentThread: [
      {
        kind: "assistant",
        text: "Store holds these claims about Birch to Cedar.",
        statements: [
          {
            text: "Its diameter is Unknown; 8 in is proposed.",
            refs: [
              {
                kind: "proposal",
                sectionId: "s-2",
                what: "value",
                attribute: "Diameter",
                key: "0",
              },
            ],
          },
          {
            text: "Owner is a claim on North line.",
            refs: [
              {
                kind: "claim",
                owner: "pipeline",
                ownerId: "p-1",
                attribute: "Owner",
              },
            ],
          },
          { text: "Store does not say when it was built." },
        ],
      },
    ],
  })
}

vi.mock("@/data/load-network", async (original) => ({
  ...(await original<typeof import("@/data/load-network")>()),
  loadNetwork: () => Promise.resolve(answered()),
}))
vi.mock("./map/map-area", () => ({ MapArea: () => null }))

async function open() {
  await act(async () => {
    render(<StudioScreen />)
  })
  return userEvent.setup()
}

const agent = () => screen.getByRole("complementary", { name: "agent" })
const message = () => within(agent()).getByRole("textbox")

async function openSection(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("option", { name: /North line/ }))
  await user.click(screen.getByRole("treeitem", { name: /Birch to Cedar/ }))
  return within(screen.getByRole("group", { name: "Claims of Birch to Cedar" }))
}

async function menu(
  user: ReturnType<typeof userEvent.setup>,
  target: HTMLElement
) {
  await user.pointer({ keys: "[MouseRight]", target })
  return (await screen.findAllByRole("menuitem")).map((i) => i.textContent)
}

beforeEach(() => {
  localStorage.clear()
  useSettings.getState().reset()
  window.history.replaceState(null, "", "/")
  useStudio.setState(useStudio.getInitialState(), true)
  useCamera.setState(useCamera.getInitialState(), true)
})

describe("asking the Agent", () => {
  it("offers what surrounds a section and where to look, on a section", async () => {
    const user = await open()
    await user.click(screen.getByRole("option", { name: /North line/ }))
    const section = screen.getByRole("treeitem", { name: /Birch to Cedar/ })
    expect(await menu(user, section)).toEqual([
      "What does store say about this?",
      "What surrounds this section?",
      "What could we look for here?",
      "Add to the Agent chat",
    ])
  })

  it("offers questions that only read on a claim, by what the claim is", async () => {
    const user = await open()
    const claims = await openSection(user)
    const row = (name: string) =>
      claims
        .getAllByRole("treeitem")
        .find((r) => r.textContent?.startsWith(name))!

    // Unknown, with a proposal waiting: all three, then the plain item.
    expect(await menu(user, row("Diameter"))).toEqual([
      "What does store say about this?",
      "Why is this Unknown?",
      "What is proposed here, and why?",
      "Add to the Agent chat",
    ])
    await user.keyboard("{Escape}")
    // Nothing that searches the sources or changes a claim.
    expect(screen.queryByRole("menuitem", { name: /Find|Change/ })).toBeNull()
  })

  it("starts the question: attaches the claim, opens the chat, puts the words in", async () => {
    const user = await open()
    const claims = await openSection(user)
    const build = claims
      .getAllByRole("treeitem")
      .find((r) => r.textContent?.startsWith("Build date"))!
    await menu(user, build)
    await user.click(
      screen.getByRole("menuitem", { name: "Why is this Unknown?" })
    )

    expect(message()).toHaveValue("Why is this Unknown?")
    expect(message()).toHaveFocus()
    expect(agent()).toHaveTextContent("Build date")
    expect(agent()).toHaveTextContent("Claim · Birch to Cedar")
    // The person can change the words before sending.
    await user.clear(message())
    await user.type(message(), "Why is the build date Unknown?")
    expect(message()).toHaveValue("Why is the build date Unknown?")
  })

  it("keeps a sent question, says the Agent cannot answer yet, and clears the box", async () => {
    const user = await open()
    const claims = await openSection(user)
    const build = claims
      .getAllByRole("treeitem")
      .find((r) => r.textContent?.startsWith("Build date"))!
    await menu(user, build)
    await user.click(
      screen.getByRole("menuitem", { name: "Why is this Unknown?" })
    )
    await user.click(within(agent()).getByRole("button", { name: "Send" }))

    const log = within(agent()).getByRole("log")
    expect(log).toHaveTextContent("Why is this Unknown?")
    expect(log).toHaveTextContent("The Agent cannot answer yet.")
    expect(message()).toHaveValue("")
    expect(useStudio.getState().agentRefs).toEqual([])

    // What the later service will receive, and nothing more.
    const [{ question }] = useStudio.getState().sentQuestions
    expect(question).toEqual({
      words: "Why is this Unknown?",
      about: [
        {
          kind: "claim",
          id: null,
          on: { sectionId: "s-2", attribute: "Build date" },
        },
      ],
      network: "Test network",
    })
  })

  it("asks about a proposal from under it, and decides nothing", async () => {
    const user = await open()
    act(() => useStudio.getState().selectAttribute("s-6", "Last seen"))
    await user.click(
      screen.getByRole("button", { name: /Ask the Agent about this/ })
    )
    expect(message()).toHaveValue("What is proposed here, and why?")
    expect(agent()).toHaveTextContent("Proposed end")
    expect(agent()).toHaveTextContent("Proposal · Fir to Gale")
    // The section's Last seen is as it was.
    const lastSeen = evidenceNetwork()
      .sections.find((s) => s.id === "s-6")!
      .claims.find((c) => c.attribute === "Last seen")
    expect(lastSeen?.value).toBeNull()
  })

  it("attaches a pipeline's own claim and a source by right click", async () => {
    const user = await open()
    await user.click(screen.getByRole("option", { name: /North line/ }))
    const own = screen.getByRole("group", { name: "Claims about North line" })
    const owner = within(own).getAllByText("Owner")[1].closest("div")!
    await menu(user, owner)
    await user.click(
      screen.getByRole("menuitem", { name: "Add to the Agent chat" })
    )
    expect(useStudio.getState().agentRefs).toEqual([
      {
        kind: "claim",
        owner: "pipeline",
        ownerId: "p-1",
        attribute: "Owner",
        index: 1,
      },
    ])

    act(() => useStudio.getState().selectAttribute("s-1", "Diameter"))
    const sources = screen.getByRole("list", { name: "Sources" })
    await menu(user, within(sources).getByRole("listitem"))
    await user.click(
      screen.getByRole("menuitem", { name: "Add to the Agent chat" })
    )
    expect(useStudio.getState().agentRefs).toHaveLength(2)
    expect(useStudio.getState().agentRefs[1]).toMatchObject({
      kind: "citation",
      sectionId: "s-1",
      attribute: "Diameter",
    })
  })

  it("shows an answer's statements with what each rests on; a click opens it", async () => {
    const user = await open()
    await user.click(
      within(screen.getByRole("navigation", { name: "Panels" })).getByRole(
        "button",
        { name: /^Agent/ }
      )
    )
    const log = within(agent()).getByRole("log")
    expect(log).toHaveTextContent("Store does not say when it was built.")

    await user.click(
      within(log).getByRole("button", { name: /Diameter, proposed/ })
    )
    expect(useStudio.getState()).toMatchObject({
      selectedSectionId: "s-2",
      selectedAttribute: "Diameter",
    })

    await user.click(within(log).getByRole("button", { name: /^Open Owner/ }))
    expect(useStudio.getState().selectedPipelineId).toBe("p-1")
    expect(useStudio.getState().selection).toEqual(new Set(["s-1", "s-2"]))
  })
})
