import { defineConfig } from "vite";

// Builds a single self-contained dist/widget.js (IIFE) with no external deps,
// suitable for a CDN <script> tag. Also runs the vitest suite (jsdom env).
export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["iife"],
      name: "ChatForgeWidget",
      fileName: () => "widget.js",
    },
    minify: "esbuild",
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
  test: {
    environment: "jsdom",
  },
});
