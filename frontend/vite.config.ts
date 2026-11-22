import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { loadEnv } from "vite"
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin"
import { playwright } from "@vitest/browser-playwright"
import { defineConfig } from "vitest/config"

// Any token is taken by the fake GitHub; this one names itself in store's logs.
const LOCAL_DEV_TOKEN = "local-dev"

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // STORE_URL is read here, on the server side. Store refuses a request with no
  // token. VITE_AUTH=local sends a fixed one, which a local store pointed at the
  // fake GitHub (dev/fake-github) takes as the person "Local developer". The
  // same switch tells the app to ask store who this is instead of the gate.
  const env = loadEnv(mode, import.meta.dirname, "")
  const localToken =
    env.VITE_AUTH === "local"
      ? { Authorization: `Bearer ${LOCAL_DEV_TOKEN}` }
      : undefined
  // With GATE_URL, sign-in, store and the Agent all go through the gate, which
  // adds the signed-in person's token (plan 2026-11-21-003). It keeps the
  // paths as they are and sees this origin, as it will behind nginx.
  const gate = env.GATE_URL
    ? Object.fromEntries(
        ["/auth", "/store", "/agent"].map((path) => [
          path,
          { target: env.GATE_URL, changeOrigin: false },
        ])
      )
    : null
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": resolve(import.meta.dirname, "./src"),
      },
    },
    server: {
      proxy: gate ?? {
        // The app asks its own origin for store; this passes it on.
        // nginx.conf does the same in the container.
        "/store": {
          target: env.STORE_URL || "http://localhost:47110",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/store/, ""),
          headers: localToken,
        },
        // The Agent service (studio/agent). It takes no token; the browser never
        // holds one. Its answers stream, so nothing here may buffer them.
        "/agent": {
          target: env.AGENT_URL || "http://127.0.0.1:47190",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/agent/, ""),
        },
      },
    },
    test: {
      projects: [
        {
          // The app's tests: React Testing Library in jsdom.
          extends: true,
          test: {
            name: "unit",
            environment: "jsdom",
            setupFiles: ["./src/test/setup.ts"],
            // Tests run on the sample, whatever a developer's .env.local says.
            env: { VITE_DATA_SOURCE: "fixture" },
            css: false,
            include: ["src/**/*.test.{ts,tsx}"],
          },
        },
        {
          // Every story, and its play function, in a real browser.
          extends: true,
          plugins: [
            storybookTest({
              configDir: resolve(import.meta.dirname, ".storybook"),
            }),
          ],
          test: {
            name: "storybook",
            browser: {
              enabled: true,
              headless: true,
              provider: playwright(),
              instances: [{ browser: "chromium" }],
            },
          },
        },
        {
          // The visual test: every story, then a screenshot compared with the
          // approved one in visual/. Run on Linux only (CI, or Docker), never
          // in `pnpm check`: see src/test/visual-setup.ts.
          extends: true,
          plugins: [
            storybookTest({
              configDir: resolve(import.meta.dirname, ".storybook"),
            }),
          ],
          test: {
            name: "visual",
            setupFiles: ["./src/test/visual-setup.ts"],
            browser: {
              enabled: true,
              headless: true,
              provider: playwright(),
              instances: [{ browser: "chromium" }],
              viewport: { width: 480, height: 640 },
              expect: {
                toMatchScreenshot: {
                  resolveScreenshotPath: ({
                    root,
                    testFileDirectory,
                    testFileName,
                    arg,
                    browserName,
                    platform,
                    ext,
                  }) =>
                    resolve(
                      root,
                      "visual",
                      testFileDirectory.replace(/^src\//, ""),
                      testFileName.replace(/\.stories\.tsx$/, ""),
                      `${arg}-${browserName}-${platform}${ext}`
                    ),
                },
              },
            },
          },
        },
      ],
      // `pnpm coverage`: lines and branches of the app's own code. What a
      // change touches is read from this, file by file; no number is a goal.
      coverage: {
        provider: "v8",
        include: ["src/**/*.{ts,tsx}"],
        exclude: [
          "src/**/*.test.{ts,tsx}",
          "src/test/**",
          "src/components/ui/**",
          "src/styles/**",
          "src/main.tsx",
        ],
        reporter: ["text", "json-summary", "json"],
        reportsDirectory: "./coverage",
      },
    },
  }
})
