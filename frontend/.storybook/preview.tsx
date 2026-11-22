import type { Preview } from "@storybook/react-vite"

import { TooltipProvider } from "../src/components/ui/tooltip"
import "../src/index.css"

const preview: Preview = {
  // A docs page per component: its props and every story, beside Figma.
  tags: ["autodocs"],
  // The app's one light theme, at the left panel's width unless a story says.
  decorators: [
    (Story) => (
      <TooltipProvider>
        <div className="w-panel-left bg-background p-3 text-foreground">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
  parameters: {
    layout: "padded",
    // Every story is also checked for accessibility (axe): a problem fails
    // the test, in `pnpm test`, in CI and in the MCP `test-run`.
    a11y: { test: "error" },
  },
}

export default preview
