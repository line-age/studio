import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { loadEnv } from "vite"
import { defineConfig } from "vitest/config"

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // STORE_URL and STORE_TOKEN are read here, on the server side, and never
  // reach the bundle: only names starting with VITE_ do.
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
        // The app asks its own origin for store; this passes it on with the
        // token. nginx.conf does the same in the container.
        "/store": {
          target: env.STORE_URL || "http://localhost:47110",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/store/, ""),
          headers: { Authorization: `Bearer ${env.STORE_TOKEN ?? ""}` },
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
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      // Tests run on the sample, whatever a developer's .env.local says.
      env: { VITE_DATA_SOURCE: "fixture" },
      css: false,
    },
  }
})
