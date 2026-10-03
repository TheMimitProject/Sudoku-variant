// Daily Mesh Puzzle — hostless.
//
// Everyone in range generates the same puzzle from today's date, solves it on
// their own device, then posts their time with a proof hash. The proof is a
// commitment to the solved grid salted with the date and nick, so anyone who
// has also solved it can check the claim. No host, no server.

import { generate, formatBoard, nakedSingles } from "../engine/sudoku.js";
import { dayKey } from "../engine/rng.js";
import { commit, verify } from "../engine/commit.js";
import { parseCell, cellName, cleanNick, formatDuration } from "../engine/commands.js";

export function dailyPuzzle(date = dayKey()) {
  return generate({ size: 9, difficulty: "medium", seed: `daily:${date}` });
}

export const dailyProof = (solution, date, nick) => commit(solution.join(""), `${date}:${nick}`);
export const verifyDaily = (solution, date, nick, proof) => verify(proof, solution.join(""), `${date}:${nick}`);

function me(ctx, state, nick) {
  if (!state.local[nick]) {
    state.local[nick] = { grid: state.puzzle.slice(), start: ctx.now, mistakes: 0, done: false };
  }
  return state.local[nick];
}

export default {
  id: "daily",
  name: "Daily Mesh Puzzle",
  channel: "#daily",
  summary: "same puzzle for everyone today, no host — post your time with a proof",
  minPlayers: 1,
  maxPlayers: 99,

  create(ctx, o) {
    const date = o.date || dayKey();
    const p = dailyPuzzle(date);
    return { date, puzzle: p.puzzle, solution: p.solution, local: {}, results: [] };
  },

  start(ctx, state) {
    ctx.say(`DAILY ${state.date} · same puzzle for everyone in range · no host`);
  },

  snapshot(ctx, state, nick) {
    const m = me(ctx, state, nick);
    return [`daily ${state.date} · ${m.grid.filter((v) => !v).length} left · checked on your device, nothing is sent · /daily show`];
  },

  commands: [
    {
      name: "daily play",
      private: true,
      aliases: ["play", "p"],
      usage: "daily play R3C5=7",
      desc: "checked on your own device — nothing is sent",
      run(ctx, state, nick, args) {
        const m = me(ctx, state, nick);
        const cell = parseCell(args.join(" "));
        if (!cell || cell.v == null) return ctx.dm(nick, "usage: /daily play R3C5=7");
        const i = cell.r * 9 + cell.c;
        if (m.done) return ctx.dm(nick, "already solved — /daily done to post your time");
        if (m.grid[i]) return ctx.dm(nick, `${cellName(cell.r, cell.c)} is already filled`);
        if (cell.v !== state.solution[i]) {
          m.mistakes++;
          return ctx.dm(nick, `✗ ${cellName(cell.r, cell.c)}=${cell.v} doesn't fit (${m.mistakes} mistakes)`);
        }
        m.grid[i] = cell.v;
        if (m.grid.every(Boolean)) {
          m.done = true;
          m.time = ctx.now - m.start;
          ctx.dm(nick, `✓ solved in ${formatDuration(m.time)} — /daily done to post it`);
        } else {
          ctx.dm(nick, `✓ ${cellName(cell.r, cell.c)}=${cell.v} · ${m.grid.filter((v) => !v).length} left`);
        }
      },
    },
    {
      name: "daily done",
      usage: "daily done",
      desc: "post your time and proof to the channel",
      run(ctx, state, nick) {
        const m = me(ctx, state, nick);
        if (!m.done) return ctx.dm(nick, `not solved yet — ${m.grid.filter((v) => !v).length} cells left`);
        if (m.posted) return ctx.dm(nick, "already posted");
        m.posted = true;
        const proof = dailyProof(state.solution, state.date, nick);
        state.results.push({ nick, time: m.time, mistakes: m.mistakes, proof });
        ctx.say(`${nick} solved daily ${state.date} in ${formatDuration(m.time)} · ${m.mistakes} mistakes · proof ${proof}`);
      },
    },
    {
      name: "daily verify",
      usage: "daily verify @nick <proof>",
      desc: "check someone's proof (you must have solved it too)",
      readOnly: true,
      run(ctx, state, nick, args) {
        const who = cleanNick(args[0]);
        const proof = args[1];
        if (!who || !proof) return ctx.dm(nick, "usage: /daily verify @nick <proof>");
        if (!me(ctx, state, nick).done) return ctx.dm(nick, "solve today's puzzle first — the proof is checked against your own solution");
        ctx.dm(nick, verifyDaily(state.solution, state.date, who, proof) ? `✓ ${who}'s proof is valid` : `✗ ${who}'s proof does NOT match`);
      },
    },
    {
      name: "daily board",
      aliases: ["score", "daily score"],
      usage: "daily board",
      desc: "today's posted times",
      readOnly: true,
      run(ctx, state) {
        const r = [...state.results].sort((a, b) => a.time + a.mistakes * 30000 - (b.time + b.mistakes * 30000));
        if (!r.length) return ctx.say("no times posted yet today");
        ctx.say(`DAILY ${state.date} (mistakes add 30s)`);
        r.forEach((x, k) => ctx.say(`${k + 1}. ${x.nick} ${formatDuration(x.time)} +${x.mistakes}✗`));
      },
    },
    {
      name: "daily show",
      aliases: ["show"],
      usage: "daily show",
      desc: "your local board",
      readOnly: true,
      run(ctx, state, nick) {
        ctx.dmLines(nick, formatBoard(me(ctx, state, nick).grid, 9));
      },
    },
  ],

  bot(ctx, state, nick) {
    const m = me(ctx, state, nick);
    if (m.done) return m.posted ? null : "/daily done";
    const singles = nakedSingles(m.grid, 9);
    let i, v;
    if (singles.length) ({ i, v } = ctx.rng.pick(singles));
    else {
      i = ctx.rng.pick([...m.grid.keys()].filter((k) => !m.grid[k]));
      v = state.solution[i];
    }
    if (ctx.rng.chance(0.04)) v = (v % 9) + 1;
    return `/daily play ${cellName(Math.floor(i / 9), i % 9)}=${v}`;
  },

  view(state, nick) {
    const m = state.local[nick];
    const grid = m ? m.grid : state.puzzle;
    return {
      mode: "daily",
      size: 9,
      box: [3, 3],
      date: state.date,
      done: !!m?.done,
      posted: !!m?.posted,
      mistakes: m?.mistakes ?? 0,
      results: state.results,
      cells: grid.map((v, i) => ({ v, given: !!state.puzzle[i], by: v && !state.puzzle[i] ? nick : null })),
    };
  },
};
