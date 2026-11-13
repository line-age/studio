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
      },
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      css: false,
    },
  }
})
