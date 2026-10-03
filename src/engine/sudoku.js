// Sudoku core: solver, solution counter, unique-solution generator,
// compact encoding and the text board format used over the mesh.
// Grids are flat arrays of length size*size; 0 means empty.

import { createRng } from "./rng.js";

export const BOX = { 4: [2, 2], 6: [2, 3], 9: [3, 3] };

/** Clue targets per size and difficulty. Fewer clues = harder. */
export const CLUES = {
  9: { easy: 38, medium: 32, hard: 26 },
  6: { easy: 18, medium: 14, hard: 12 },
};

/** Precomputed peer lists: the cells that share a row, column or box. */
const peerCache = new Map();
export function peers(size) {
  if (peerCache.has(size)) return peerCache.get(size);
  const [bh, bw] = BOX[size];
  const list = [];
  for (let i = 0; i < size * size; i++) {
    const r = Math.floor(i / size), c = i % size;
    const set = new Set();
    for (let k = 0; k < size; k++) {
      set.add(r * size + k);
      set.add(k * size + c);
    }
    const br = Math.floor(r / bh) * bh, bc = Math.floor(c / bw) * bw;
    for (let rr = br; rr < br + bh; rr++) for (let cc = bc; cc < bc + bw; cc++) set.add(rr * size + cc);
    set.delete(i);
    list.push([...set]);
  }
  peerCache.set(size, list);
  return list;
}

export function boxIndex(i, size) {
  const [bh, bw] = BOX[size];
  const r = Math.floor(i / size), c = i % size;
  return Math.floor(r / bh) * (size / bw) + Math.floor(c / bw);
}

/** Bitmask of digits still possible at cell i. */
export function candidates(grid, i, size) {
  const full = (1 << (size + 1)) - 2;
  let used = 0;
  for (const p of peers(size)[i]) if (grid[p]) used |= 1 << grid[p];
  return full & ~used;
}

const bitsToDigits = (mask, size) => {
  const out = [];
  for (let d = 1; d <= size; d++) if (mask & (1 << d)) out.push(d);
  return out;
};

export function isValidPlacement(grid, i, v, size) {
  for (const p of peers(size)[i]) if (grid[p] === v) return false;
  return true;
}

/**
 * Backtracking search with "fewest candidates first".
 * Returns the number of solutions found (stops at `limit`). If `onSolution`
 * is given it receives each solution grid.
 */
function search(grid, size, limit, rng, onSolution) {
  const g = grid.slice();
  let count = 0;
  const n = size * size;

  const rec = () => {
    let best = -1, bestMask = 0, bestCount = 99;
    for (let i = 0; i < n; i++) {
      if (g[i]) continue;
      const mask = candidates(g, i, size);
      let cnt = 0;
      for (let m = mask; m; m &= m - 1) cnt++;
      if (cnt === 0) return false;
      if (cnt < bestCount) {
        best = i; bestMask = mask; bestCount = cnt;
        if (cnt === 1) break;
      }
    }
    if (best === -1) {
      count++;
      onSolution?.(g.slice());
      return count >= limit;
    }
    let digits = bitsToDigits(bestMask, size);
    if (rng) digits = rng.shuffle(digits);
    for (const d of digits) {
      g[best] = d;
      if (rec()) return true;
    }
    g[best] = 0;
    return false;
  };
  rec();
  return count;
}

export function solve(grid, size = 9, rng = null) {
  let sol = null;
  search(grid, size, 1, rng, (s) => (sol = s));
  return sol;
}

export function countSolutions(grid, size = 9, limit = 2) {
  return search(grid, size, limit, null);
}

/**
 * Generate a puzzle with exactly one solution.
 * Cells are removed one at a time in random order; a removal is kept only if
 * the puzzle stays unique. Stops at the clue target or when no more cells can
 * be removed (very low targets may land a few clues above the target).
 */
export function generate({ size = 9, difficulty = "medium", seed = Date.now(), clues } = {}) {
  const rng = createRng(seed);
  const target = clues ?? CLUES[size]?.[difficulty] ?? CLUES[9].medium;
  const solution = solve(new Array(size * size).fill(0), size, rng);
  const puzzle = solution.slice();
  let filled = size * size;
  for (const i of rng.shuffle([...Array(size * size).keys()])) {
    if (filled <= target) break;
    const keep = puzzle[i];
    puzzle[i] = 0;
    if (countSolutions(puzzle, size, 2) !== 1) puzzle[i] = keep;
    else filled--;
  }
  return { puzzle, solution, size, clues: filled, seed, difficulty };
}

// ------------------------------------------------------------------
// Encoding
// ------------------------------------------------------------------

/**
 * Compact board string: one char per cell.
 *   digit  = given or unclaimed known value
 *   .      = empty
 *   a–z    = cell claimed by player #n (a = first player). The value is
 *            recoverable from the puzzle seed, so the letter alone is enough.
 */
export function encode(grid, claims = null) {
  return grid
    .map((v, i) => {
      if (claims && claims[i] != null) return String.fromCharCode(97 + claims[i]);
      return v ? String(v) : ".";
    })
    .join("");
}

/** Decode a board string. Claimed letters decode to 0 unless a solution is given. */
export function decode(str, solution = null) {
  const grid = [];
  const claims = [];
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch >= "1" && ch <= "9") { grid.push(Number(ch)); claims.push(null); }
    else if (ch >= "a" && ch <= "z") { grid.push(solution ? solution[i] : 0); claims.push(ch.charCodeAt(0) - 97); }
    else { grid.push(0); claims.push(null); }
  }
  return { grid, claims };
}

/**
 * Human-readable board for the channel. `marks[i]` (optional) replaces a
 * cell's text, e.g. "?" for cells the reader doesn't know.
 */
export function formatBoard(grid, size = 9, marks = null) {
  const [bh, bw] = BOX[size];
  const lines = [];
  for (let r = 0; r < size; r++) {
    if (r && r % bh === 0) lines.push(lines[0].replace(/[^|]/g, "-").replace(/\|/g, "+"));
    const parts = [];
    for (let c = 0; c < size; c++) {
      const i = r * size + c;
      const t = marks?.[i] ?? (grid[i] ? String(grid[i]) : ".");
      parts.push(t);
      if (c < size - 1 && (c + 1) % bw === 0) parts.push("|");
    }
    lines.push(parts.join(" "));
  }
  return lines;
}

/** Cells in the current grid that have exactly one candidate (naked singles). */
export function nakedSingles(grid, size = 9) {
  const out = [];
  for (let i = 0; i < grid.length; i++) {
    if (grid[i]) continue;
    const mask = candidates(grid, i, size);
    if (mask && (mask & (mask - 1)) === 0) out.push({ i, v: Math.log2(mask) });
  }
  return out;
}
