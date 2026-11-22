import { defineConfig, devices } from "@playwright/test"

/*
 * User flows (`pnpm test:e2e`): the built app in Chromium, on the invented
 * sample, end to end. Only the flows a person cannot do without; everything
 * else is a story or an RTL test (workspace AGENTS.md, "How to test").
 *
 * The app is built and served on its own: the sample, never store, and no
 * map token, whatever .env.local says (a value on the command line wins).
 */
const PORT = 4178

export default defineConfig({
  testDir: "e2e",
  outputDir: "e2e/.results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  expect: { timeout: 5_000 },
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    actionTimeout: 5_000,
    navigationTimeout: 15_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm exec vite build --outDir e2e/.dist --emptyOutDir && pnpm exec vite preview --outDir e2e/.dist --port ${PORT} --strictPort`,
    env: {
      VITE_DATA_SOURCE: "fixture",
      VITE_FIXTURE_URL: "",
      VITE_MAPBOX_TOKEN: "",
    },
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
