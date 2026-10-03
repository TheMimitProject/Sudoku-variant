import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the build works at https://<user>.github.io/Sudoku-variant/
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { outDir: "dist", sourcemap: true, chunkSizeWarningLimit: 1500 },
  test: { include: ["tests/**/*.test.js"] },
});
