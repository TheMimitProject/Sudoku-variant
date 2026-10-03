// Word Grid — Boggle-style. The host posts a 4x4 letter grid; everyone has a
// few minutes to post words. Only "found a 5-letter word" is announced live so
// nobody can copy; words are revealed at the end and duplicates cancel out.

import WORDS from "../data/words.js";
import { parseDuration, formatDuration } from "../engine/commands.js";

const DICE = [
  "AAEEGN", "ABBJOO", "ACHOPS", "AFFKPS", "AOOTTW", "CIMOTU", "DEILRX", "DELRVY",
  "DISTTY", "EEGHNW", "EEINSU", "EHRTVW", "EIOSST", "ELRTTY", "HIMNUQ", "HLNNRZ",
];

let dictCache = null;
export function dictionary() {
  if (!dictCache) {
    const set = new Set(WORDS.split(" "));
    const prefixes = new Set();
    for (const w of set) for (let k = 1; k < w.length; k++) prefixes.add(w.slice(0, k));
    dictCache = { set, prefixes };
  }
  return dictCache;
}

export const wordPoints = (w) => (w.length <= 4 ? 1 : w.length === 5 ? 2 : w.length === 6 ? 3 : w.length === 7 ? 5 : 11);

/** Cell faces: "Q" is played as "QU". */
const face = (ch) => (ch === "Q" ? "QU" : ch);

/** Can `word` be traced on the grid with adjacent, non-repeating cells? */
export function traceable(grid, word) {
  const W = word.toUpperCase();
  const n = 4;
  const used = Array(16).fill(false);
  const rec = (i, pos) => {
    const f = face(grid[i]);
    if (!W.startsWith(f, pos)) return false;
    const next = pos + f.length;
    if (next === W.length) return true;
    used[i] = true;
    const r = Math.floor(i / n), c = i % n;
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc, j = rr * n + cc;
        if ((dr || dc) && rr >= 0 && cc >= 0 && rr < n && cc < n && !used[j] && rec(j, next)) {
          used[i] = false;
          return true;
        }
      }
    used[i] = false;
    return false;
  };
  return grid.some((_, i) => rec(i, 0));
}

/** Every dictionary word on the grid (used by bots and the end-of-round reveal). */
export function allWords(grid) {
  const { set, prefixes } = dictionary();
  const found = new Set();
  const used = Array(16).fill(false);
  const rec = (i, s) => {
    const w = s + face(grid[i]).toLowerCase();
    if (!prefixes.has(w) && !set.has(w)) return;
    if (w.length >= 3 && set.has(w)) found.add(w);
    used[i] = true;
    const r = Math.floor(i / 4), c = i % 4;
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc, j = rr * 4 + cc;
        if ((dr || dc) && rr >= 0 && cc >= 0 && rr < 4 && cc < 4 && !used[j]) rec(j, w);
      }
    used[i] = false;
  };
  for (let i = 0; i < 16; i++) rec(i, "");
  return [...found];
}

export function rollGrid(rng) {
  return rng.shuffle(DICE).map((d) => d[rng.int(6)]);
}

const gridLines = (grid) => [0, 1, 2, 3].map((r) => grid.slice(r * 4, r * 4 + 4).map((ch) => face(ch).padEnd(2)).join(" "));

function endRound(ctx, state) {
  state.over = true;
  const owners = {};
  for (const [nick, words] of Object.entries(state.words)) for (const w of words) (owners[w] ||= []).push(nick);
  const lines = ["WORD GRID — time!"];
  for (const [nick, words] of Object.entries(state.words)) {
    const unique = [...words].filter((w) => owners[w].length === 1);
    const pts = unique.reduce((s, w) => s + wordPoints(w), 0);
    ctx.score(nick, pts);
    lines.push(`${nick}: ${unique.join(" ") || "—"} (${pts})`);
  }
  const shared = Object.keys(owners).filter((w) => owners[w].length > 1);
  if (shared.length) lines.push(`cancelled (found by 2+): ${shared.join(" ")}`);
  const all = allWords(state.grid);
  const missed = all.filter((w) => !owners[w]).sort((a, b) => b.length - a.length).slice(0, 5);
  if (missed.length) lines.push(`longest missed: ${missed.join(" ")}`);
  ctx.end([...lines, ...ctx.scoreLines()]);
}

export default {
  id: "wordgrid",
  name: "Word Grid",
  channel: "#words",
  summary: "Boggle-style word hunt, unique words score",
  minPlayers: 1,
  maxPlayers: 12,

  create(ctx, o) {
    return { grid: rollGrid(ctx.rng), words: {}, roundMs: parseDuration(o.round, 180000), over: false, startedAt: ctx.now };
  },

  start(ctx, state) {
    ctx.say(`WORD GRID · ${formatDuration(state.roundMs)} · /word STREAM · 3+ letters, adjacent cells, no reuse`);
    ctx.sayLines(gridLines(state.grid));
    ctx.after(state.roundMs, () => endRound(ctx, state));
  },

  snapshot: (ctx, state) => [`${formatDuration(state.roundMs - (ctx.now - state.startedAt))} left`, ...gridLines(state.grid)],

  commands: [
    {
      name: "word",
      aliases: ["w"],
      usage: "word STREAM",
      desc: "submit a word",
      run(ctx, state, nick, args) {
        const w = String(args[0] || "").toLowerCase();
        const mine = (state.words[nick] ||= new Set());
        if (w.length < 3) return ctx.dm(nick, "3+ letters");
        if (mine.has(w)) return ctx.dm(nick, `you already have ${w}`);
        if (!traceable(state.grid, w)) return ctx.dm(nick, `✗ ${w} isn't on the grid`);
        if (!dictionary().set.has(w)) return ctx.dm(nick, `✗ ${w} isn't in the dictionary`);
        mine.add(w);
        ctx.dm(nick, `✓ ${w} (${wordPoints(w)} pts if nobody else finds it)`);
        ctx.say(`${nick} found a ${w.length}-letter word (${mine.size} total)`);
      },
    },
    { name: "grid", aliases: ["show"], usage: "grid", desc: "show the letters", readOnly: true, run: (ctx, state) => ctx.sayLines(gridLines(state.grid)) },
    { name: "words end", usage: "words end", desc: "host: end the round now", hidden: true, run: (ctx, state) => endRound(ctx, state) },
  ],

  bot(ctx, state, nick) {
    if (state.over || !ctx.rng.chance(0.5)) return null;
    state.botPool ||= allWords(state.grid);
    const mine = state.words[nick] || new Set();
    const options = state.botPool.filter((w) => !mine.has(w) && w.length <= 6);
    return options.length ? `/word ${ctx.rng.pick(options)}` : null;
  },

  view: (state) => ({ grid: state.grid.map(face), lines: gridLines(state.grid) }),
};
