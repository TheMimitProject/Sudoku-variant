/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/web/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: { mono: ['"JetBrains Mono"', '"IBM Plex Mono"', "ui-monospace", "monospace"] },
      colors: {
        ink: { 950: "#03080c", 900: "#071117", 850: "#0a1820", 800: "#0e202a", 700: "#163240" },
        signal: "#5eead4",
      },
    },
  },
  plugins: [],
};
