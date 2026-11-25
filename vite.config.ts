import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset URLs: the built game works wherever it is served from,
  // e.g. GitHub Pages serves it under /ai-assisted-sw-dev-lab5/, not at /.
  base: "./",
  build: {
    target: "es2022",
    // Source maps in production too, so breakpoints in the .ts files also bind
    // when debugging the built game (`npm run preview`).
    sourcemap: true,
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
