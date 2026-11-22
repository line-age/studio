import type { Preview } from "@storybook/react-vite"

import { TooltipProvider } from "../src/components/ui/tooltip"
import "../src/index.css"

const preview: Preview = {
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
  parameters: { layout: "padded" },
}

export default preview
