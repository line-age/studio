import type { StorybookConfig } from "@storybook/react-vite"

/*
 * Stories: each state of a component that stands on its own, with a play
 * function where a state is reached by acting on it (workspace AGENTS.md,
 * "How to test components"). Invented data only, as in the tests.
 */
const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: ["../src/**/*.stories.tsx"],
  addons: ["@storybook/addon-vitest"],
  core: { disableTelemetry: true },
}

export default config
