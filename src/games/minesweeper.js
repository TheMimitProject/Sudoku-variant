// Minesweeper Co-op — one shared board, one action per player per turn.
// Digging a mine costs the team a life. Wrong flags are counted at the end.

import { parseCoord, coordName } from "../engine/commands.js";

const SIZES = { easy: [8, 8, 8], medium: [9, 9, 12], hard: [10, 10, 18] };

function neighbors(state, r, c) {
  const out = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr, cc = c + dc;
      if ((dr || dc) && rr >= 0 && cc >= 0 && rr < state.rows && cc < state.cols) out.push([rr, cc]);
    }
  return out;
}

const idx = (state, r, c) => r * state.cols + c;

function layMines(ctx, state, safeR, safeC) {
  const banned = new Set([idx(state, safeR, safeC), ...neighbors(state, safeR, safeC).map(([r, c]) => idx(state, r, c))]);
  const pool = ctx.rng.shuffle([...Array(state.rows * state.cols).keys()].filter((i) => !banned.has(i)));
  pool.slice(0, state.mineCount).forEach((i) => (state.mines[i] = true));
  for (let r = 0; r < state.rows; r++)
    for (let c = 0; c < state.cols; c++)
      state.counts[idx(state, r, c)] = neighbors(state, r, c).filter(([rr, cc]) => state.mines[idx(state, rr, cc)]).length;
  state.laid = true;
}

function flood(state, r, c) {
  const stack = [[r, c]];
  let opened = 0;
  while (stack.length) {
    const [rr, cc] = stack.pop();
    const i = idx(state, rr, cc);
    if (state.open[i] || state.flags[i]) continue;
    state.open[i] = true;
    opened++;
    if (state.counts[i] === 0) stack.push(...neighbors(state, rr, cc));
  }
  return opened;
}

export function boardLines(state, revealAll = false) {
  const head = "   " + Array.from({ length: state.cols }, (_, c) => String.fromCharCode(65 + c)).join(" ");
  const rows = [];
  for (let r = 0; r < state.rows; r++) {
    const cells = [];
    for (let c = 0; c < state.cols; c++) {
      const i = idx(state, r, c);
      if (state.boom[i]) cells.push("*");
      else if (state.flags[i]) cells.push(revealAll && !state.mines[i] ? "X" : "F");
      else if (state.open[i]) cells.push(state.counts[i] ? String(state.counts[i]) : " ");
      else cells.push(revealAll && state.mines[i] ? "*" : "#");
    }
    rows.push(String(r + 1).padStart(2) + " " + cells.join(" "));
  }
  return [head, ...rows];
}

function afterAction(ctx, state, nick) {
  state.lastActor = nick;
  const safeLeft = state.rows * state.cols - state.mineCount - state.open.filter(Boolean).length;
  if (state.lives <= 0) {
    ctx.sayLines(boardLines(state, true));
    return ctx.end([`💥 Out of lives — the mesh lost with ${safeLeft} safe cells left.`]);
  }
  if (safeLeft === 0) {
    const wrong = state.flags.filter((f, i) => f && !state.mines[i]).length;
    ctx.sayLines(boardLines(state, true));
    return ctx.end([`🟩 Board cleared! ${state.lives} lives left · ${wrong} wrong flags`, ...ctx.scoreLines()]);
  }
  if (++state.actions % 4 === 0) ctx.sayLines(boardLines(state));
}

function turnCheck(ctx, state, nick) {
  if (ctx.players().length > 1 && state.lastActor === nick) {
    ctx.dm(nick, "one action per turn — let someone else go");
    return false;
  }
  return true;
}

export default {
  id: "minesweeper",
  name: "Minesweeper Co-op",
  channel: "#mines",
  summary: "shared board, one move each, 3 lives",
  minPlayers: 1,
  maxPlayers: 8,

  create(ctx, o) {
    const [rows, cols, mineCount] = SIZES[o.difficulty] || SIZES.medium;
    const n = rows * cols;
    return {
      rows, cols, mineCount,
      mines: Array(n).fill(false), counts: Array(n).fill(0), open: Array(n).fill(false),
      flags: Array(n).fill(false), boom: Array(n).fill(false),
      lives: o.lives ?? 3, laid: false, lastActor: null, actions: 0,
    };
  },

  start(ctx, state) {
    ctx.say(`MINESWEEPER CO-OP · ${state.cols}x${state.rows} · ${state.mineCount} mines · ${state.lives} lives · /dig C4  /flag C4`);
  },

  snapshot(ctx, state) {
    return [`lives ${state.lives}`, ...boardLines(state)];
  },

  commands: [
    {
      name: "dig",
      aliases: ["d"],
      usage: "dig C4",
      desc: "open a cell",
      run(ctx, state, nick, args) {
        const p = parseCoord(args[0], state.rows, state.cols);
        if (!p) return ctx.dm(nick, "usage: /dig C4");
        if (!turnCheck(ctx, state, nick)) return;
        const i = idx(state, p.r, p.c);
        if (state.open[i] || state.boom[i]) return ctx.dm(nick, `${coordName(p.r, p.c)} is already open`);
        if (state.flags[i]) return ctx.dm(nick, `${coordName(p.r, p.c)} is flagged — /unflag it first`);
        if (!state.laid) layMines(ctx, state, p.r, p.c);
        if (state.mines[i]) {
          state.boom[i] = true;
          state.lives--;
          ctx.score(nick, -2);
          ctx.say(`💥 ${nick} hit a mine at ${coordName(p.r, p.c)}! ${state.lives} lives left`);
        } else {
          const n = flood(state, p.r, p.c);
          ctx.score(nick, n);
          ctx.say(`⛏ ${nick} dug ${coordName(p.r, p.c)} → ${state.counts[i] || "clear"}${n > 1 ? ` (+${n} opened)` : ""}`);
        }
        afterAction(ctx, state, nick);
      },
    },
    {
      name: "flag",
      aliases: ["f"],
      usage: "flag C4",
      desc: "mark a mine",
      run(ctx, state, nick, args) {
        const p = parseCoord(args[0], state.rows, state.cols);
        if (!p) return ctx.dm(nick, "usage: /flag C4");
        if (!turnCheck(ctx, state, nick)) return;
        const i = idx(state, p.r, p.c);
        if (state.open[i] || state.flags[i]) return ctx.dm(nick, `can't flag ${coordName(p.r, p.c)}`);
        state.flags[i] = true;
        ctx.say(`🚩 ${nick} flagged ${coordName(p.r, p.c)}`);
        afterAction(ctx, state, nick);
      },
    },
    {
      name: "unflag",
      usage: "unflag C4",
      desc: "remove a flag",
      run(ctx, state, nick, args) {
        const p = parseCoord(args[0], state.rows, state.cols);
        if (!p) return;
        state.flags[idx(state, p.r, p.c)] = false;
        ctx.say(`${nick} removed the flag at ${coordName(p.r, p.c)}`);
      },
    },
    { name: "mines", aliases: ["show"], usage: "mines", desc: "show the board", readOnly: true, run: (ctx, state) => ctx.sayLines(boardLines(state)) },
  ],

  bot(ctx, state, nick) {
    if (ctx.players().length > 1 && state.lastActor === nick) return null;
    const hidden = (i) => !state.open[i] && !state.flags[i] && !state.boom[i];
    if (!state.laid) return `/dig ${coordName(ctx.rng.int(state.rows), ctx.rng.int(state.cols))}`;
    // Simple deductions from opened numbers.
    for (let r = 0; r < state.rows; r++)
      for (let c = 0; c < state.cols; c++) {
        const i = idx(state, r, c);
        if (!state.open[i] || !state.counts[i]) continue;
        const nb = neighbors(state, r, c);
        const hid = nb.filter(([rr, cc]) => hidden(idx(state, rr, cc)));
        const known = nb.filter(([rr, cc]) => state.flags[idx(state, rr, cc)] || state.boom[idx(state, rr, cc)]).length;
        if (!hid.length) continue;
        if (hid.length + known === state.counts[i]) return `/flag ${coordName(...hid[0])}`;
        if (known === state.counts[i]) return `/dig ${coordName(...hid[0])}`;
      }
    const cand = [...state.open.keys()].filter(hidden);
    if (!cand.length) return null;
    const i = ctx.rng.pick(cand);
    return `/dig ${coordName(Math.floor(i / state.cols), i % state.cols)}`;
  },

  view(state) {
    return { lives: state.lives, lines: boardLines(state) };
  },
};
