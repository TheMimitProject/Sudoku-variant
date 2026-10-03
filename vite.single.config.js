// One self-contained index.html (all scripts, styles and the word list inlined),
// for drag-and-drop deploys:  npm run build:single  →  dist-single/index.html
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  base: "./",
  plugins: [react(), viteSingleFile()],
  build: { outDir: "dist-single", sourcemap: false, chunkSizeWarningLimit: 5000 },
});
