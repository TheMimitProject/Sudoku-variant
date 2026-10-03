// Nonogram race — same claim-a-cell mechanics as Mesh Sudoku.
// Puzzles are only accepted if a line-by-line solver can finish them, which
// guarantees a single solution (so "first correct answer wins" is fair).

import { parseCell, cellName } from "../engine/commands.js";

export const clueOf = (line) => {
  const out = [];
  let run = 0;
  for (const v of line) {
    if (v) run++;
    else if (run) { out.push(run); run = 0; }
  }
  if (run) out.push(run);
  return out.length ? out : [0];
};

/** All ways to lay `clue` into a line of length n consistent with `known` (1 filled, 0 empty, -1 unknown). */
function linePlacements(clue, n, known) {
  const results = [];
  const blocks = clue[0] === 0 ? [] : clue;
  const line = Array(n).fill(0);
  const rec = (b, start) => {
    if (b === blocks.length) {
      for (let k = start; k < n; k++) if (known[k] === 1) return;
      results.push(line.slice());
      return;
    }
    const len = blocks[b];
    const rest = blocks.slice(b + 1).reduce((s, x) => s + x + 1, 0);
    for (let pos = start; pos + len + rest <= n; pos++) {
      if (known[pos - 1] === 1 && pos - 1 >= start) break; // can't skip a filled cell
      let ok = true;
      for (let k = pos; k < pos + len; k++) if (known[k] === 0) { ok = false; break; }
      if (ok && known[pos + len] === 1) ok = false;
      if (ok) {
        for (let k = pos; k < pos + len; k++) line[k] = 1;
        rec(b + 1, pos + len + 1);
        for (let k = pos; k < pos + len; k++) line[k] = 0;
      }
      if (known[pos] === 1) break;
    }
  };
  rec(0, 0);
  return results;
}

/** Repeatedly intersect line possibilities. Returns the solved grid or null if stuck. */
export function lineSolve(rowClues, colClues) {
  const R = rowClues.length, C = colClues.length;
  const g = Array.from({ length: R }, () => Array(C).fill(-1));
  let changed = true;
  while (changed) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      const n = pass ? R : C;
      const count = pass ? C : R;
      for (let k = 0; k < count; k++) {
        const known = pass ? g.map((row) => row[k]) : g[k];
        const opts = linePlacements(pass ? colClues[k] : rowClues[k], n, known);
        if (!opts.length) return null;
        for (let j = 0; j < n; j++) {
          if (known[j] !== -1) continue;
          const first = opts[0][j];
          if (opts.every((o) => o[j] === first)) {
            if (pass) g[j][k] = first;
            else g[k][j] = first;
            changed = true;
          }
        }
      }
    }
  }
  return g.every((row) => row.every((v) => v !== -1)) ? g : null;
}

export function generateNonogram(rng, size = 8, density = 0.55) {
  for (let attempt = 0; attempt < 500; attempt++) {
    const grid = Array.from({ length: size }, () => Array.from({ length: size }, () => (rng.chance(density) ? 1 : 0)));
    const rows = grid.map(clueOf);
    const cols = grid[0].map((_, c) => clueOf(grid.map((r) => r[c])));
    if (lineSolve(rows, cols)) return { grid, rows, cols };
  }
  throw new Error("could not generate a line-solvable nonogram");
}

function lines(state) {
  const size = state.size;
  const colW = Math.max(...state.cols.map((c) => c.length));
  const rowClueText = state.rows.map((c) => c.join(" "));
  const pad = Math.max(...rowClueText.map((t) => t.length));
  const out = [];
  for (let k = 0; k < colW; k++) {
    out.push(" ".repeat(pad + 3) + state.cols.map((c) => String(c[c.length - colW + k] ?? " ").padStart(2)).join(""));
  }
  for (let r = 0; r < size; r++) {
    const row = Array.from({ length: size }, (_, c) => {
      const m = state.marks[r][c];
      return m === 1 ? "■" : m === 0 ? "x" : "·";
    });
    out.push(rowClueText[r].padStart(pad) + " " + String(r + 1).padStart(2) + row.map((x) => x.padStart(2)).join(""));
  }
  return out;
}

function mark(kind) {
  return (ctx, state, nick, args) => {
    const cell = parseCell(args.join(" "), state.size);
    if (!cell) return ctx.dm(nick, `usage: /nono ${kind} R3C5`);
    const { r, c } = cell;
    if (state.marks[r][c] !== -1) return ctx.dm(nick, `${cellName(r, c)} is already marked`);
    const want = kind === "fill" ? 1 : 0;
    if (state.grid[r][c] === want) {
      state.marks[r][c] = want;
      state.by[r][c] = nick;
      if (want) {
        ctx.score(nick, 1);
        state.found++;
      }
      ctx.say(`${want ? "■" : "x"} ${nick} ${kind === "fill" ? "fills" : "crosses"} ${cellName(r, c)}${want ? " (+1)" : ""}`);
      if (state.found === state.total) {
        ctx.sayLines(lines(state));
        ctx.end(["NONOGRAM COMPLETE!", ...ctx.scoreLines()]);
      }
    } else {
      ctx.score(nick, -1);
      ctx.cooldown(nick, state.cooldownMs);
      ctx.say(`✗ ${nick} wrong at ${cellName(r, c)} (-1, cooldown)`);
    }
  };
}

export default {
  id: "nonogram",
  name: "Nonogram Race",
  channel: "#nono",
  summary: "picture-logic puzzle, first correct fill claims the cell",
  minPlayers: 1,
  maxPlayers: 8,

  create(ctx, o) {
    const size = [5, 8, 10].includes(o.size) ? o.size : 8;
    const p = generateNonogram(ctx.rng, size);
    return {
      size, ...p,
      marks: Array.from({ length: size }, () => Array(size).fill(-1)),
      by: Array.from({ length: size }, () => Array(size).fill(null)),
      found: 0,
      total: p.grid.flat().filter(Boolean).length,
      cooldownMs: o.cooldownMs ?? 3000,
    };
  },

  start(ctx, state) {
    ctx.say(`NONOGRAM ${state.size}x${state.size} · ${state.total} cells to fill · /nono fill R3C5  /nono x R3C5`);
    ctx.sayLines(lines(state));
  },

  snapshot: (ctx, state) => lines(state),

  commands: [
    { name: "nono fill", aliases: ["fill"], usage: "nono fill R3C5", desc: "fill a cell (+1)", run: mark("fill") },
    { name: "nono x", aliases: ["cross"], usage: "nono x R3C5", desc: "mark a cell empty", run: mark("x") },
    { name: "nono show", aliases: ["show"], usage: "nono show", desc: "show the grid", readOnly: true, run: (ctx, state) => ctx.sayLines(lines(state)) },
  ],

  bot(ctx, state) {
    // Bots solve with the same line logic from what's marked so far, then guess a little.
    const known = state.marks;
    for (let r = 0; r < state.size; r++) {
      const opts = linePlacements(state.rows[r], state.size, known[r]);
      for (let c = 0; c < state.size; c++) {
        if (known[r][c] !== -1) continue;
        if (opts.length && opts.every((o) => o[c] === opts[0][c])) return `/nono ${opts[0][c] ? "fill" : "x"} ${cellName(r, c)}`;
      }
    }
    for (let c = 0; c < state.size; c++) {
      const col = known.map((row) => row[c]);
      const opts = linePlacements(state.cols[c], state.size, col);
      for (let r = 0; r < state.size; r++) {
        if (col[r] !== -1) continue;
        if (opts.length && opts.every((o) => o[r] === opts[0][r])) return `/nono ${opts[0][r] ? "fill" : "x"} ${cellName(r, c)}`;
      }
    }
    const free = [];
    for (let r = 0; r < state.size; r++) for (let c = 0; c < state.size; c++) if (known[r][c] === -1) free.push([r, c]);
    if (!free.length) return null;
    const [r, c] = ctx.rng.pick(free);
    return `/nono ${ctx.rng.chance(0.5) ? "fill" : "x"} ${cellName(r, c)}`;
  },

  view: (state) => ({ lines: lines(state) }),
};
