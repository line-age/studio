import type { StorybookConfig } from "@storybook/react-vite"

/*
 * Stories: each state of a component that stands on its own, with a play
 * function where a state is reached by acting on it (workspace AGENTS.md,
 * "How to test components"). Invented data only, as in the tests.
 */
const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: ["../src/**/*.stories.tsx"],
  addons: [
    "@storybook/addon-vitest",
    "@storybook/addon-mcp",
    "@storybook/addon-a11y",
  ],
  core: { disableTelemetry: true },
  // For agents: the MCP addon serves each component's props and stories at
  // localhost:6006/mcp while `pnpm storybook` runs (docs: storybook.js.org/docs/ai).
  features: { componentsManifest: true },
  typescript: { reactDocgen: "react-docgen-typescript" },
}

export default config
