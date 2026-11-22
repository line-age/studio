import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { loadEnv } from "vite"
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin"
import { playwright } from "@vitest/browser-playwright"
import { defineConfig } from "vitest/config"

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // STORE_URL is read here, on the server side. Store takes a request with no
  // token as the local person while there are no users, so none is sent.
  const env = loadEnv(mode, import.meta.dirname, "")
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": resolve(import.meta.dirname, "./src"),
      },
    },
    server: {
      proxy: {
        // The app asks its own origin for store; this passes it on.
        // nginx.conf does the same in the container.
        "/store": {
          target: env.STORE_URL || "http://localhost:47110",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/store/, ""),
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
