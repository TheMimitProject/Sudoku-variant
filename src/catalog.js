// Every game and tool, with the options the CLI and console expose.

import sudoku from "./games/sudoku.js";
import daily from "./games/daily.js";
import hunt from "./games/hunt.js";
import battleship from "./games/battleship.js";
import minesweeper from "./games/minesweeper.js";
import nonogram from "./games/nonogram.js";
import wordgrid from "./games/wordgrid.js";
import poll from "./tools/poll.js";
import checkin from "./tools/checkin.js";
import scavenger from "./tools/scavenger.js";
import pingtest from "./tools/pingtest.js";

const difficulty = { key: "difficulty", label: "Difficulty", choices: ["easy", "medium", "hard"], default: "medium" };

export const CATALOG = [
  {
    module: sudoku,
    group: "Sudoku",
    players: "1–12",
    bots: 3,
    options: [
      { key: "mode", label: "Mode", choices: ["race", "territory", "blind", "relay"], default: "race" },
      { key: "size", label: "Size", choices: [9, 6], labels: ["9×9", "Mini 6×6"], default: 9 },
      difficulty,
    ],
  },
  { module: daily, group: "Sudoku", players: "any", bots: 3, options: [] },
  { module: hunt, group: "Games", players: "4–8", bots: 5, options: [{ key: "advanced", label: "Booster + Scanner (7+)", choices: [true, false], labels: ["on", "off"], default: true }] },
  { module: battleship, group: "Games", players: "2", bots: 1, options: [] },
  { module: minesweeper, group: "Games", players: "1–8", bots: 3, options: [difficulty] },
  { module: nonogram, group: "Games", players: "1–8", bots: 2, options: [{ key: "size", label: "Size", choices: [5, 8, 10], default: 8 }] },
  { module: wordgrid, group: "Games", players: "1–12", bots: 3, options: [{ key: "round", label: "Round", choices: ["90s", "3m", "5m"], default: "3m" }] },
  { module: poll, group: "Mesh tools", players: "any", bots: 4, options: [] },
  { module: checkin, group: "Mesh tools", players: "any", bots: 5, options: [] },
  { module: scavenger, group: "Mesh tools", players: "any", bots: 3, options: [] },
  { module: pingtest, group: "Mesh tools", players: "any", bots: 5, options: [] },
];

export const byId = Object.fromEntries(CATALOG.map((e) => [e.module.id, e]));

export function defaultOptions(entry) {
  return Object.fromEntries(entry.options.map((o) => [o.key, o.default]));
}
