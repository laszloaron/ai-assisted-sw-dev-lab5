import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "es2022",
    // Source maps in production too, so breakpoints in the source files also
    // bind when debugging the built game (`npm run preview`).
    sourcemap: true,
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
