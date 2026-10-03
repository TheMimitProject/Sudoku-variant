// Scavenger Hunt host — clues lead to physical spots where a code word is
// posted. Players walk there and send /found CODE. Being close enough to the
// spot to read the code is the proof; the mesh's short range does the rest.

import { formatDuration } from "../engine/commands.js";

export const DEMO_HUNT = [
  { clue: "Where the water falls but never lands", code: "FOUNTAIN", hint: "center of the plaza" },
  { clue: "I have keys but no locks", code: "PIANO", hint: "lobby" },
  { clue: "Count the steps; the code is on the top one", code: "SUMMIT", hint: "north stairs" },
  { clue: "Bread goes in, toast comes out — look behind it", code: "CRUMB", hint: "food court" },
];

const HINT_PENALTY = 60000;

function progress(state, nick) {
  return (state.progress[nick] ||= { step: 0, hints: 0, startedAt: null, finishedAt: null });
}

function sendClue(ctx, state, nick) {
  const p = progress(state, nick);
  const c = state.clues[p.step];
  ctx.dm(nick, `clue ${p.step + 1}/${state.clues.length}: ${c.clue}`);
}

function leaderboard(ctx, state) {
  const rows = Object.entries(state.progress)
    .map(([n, p]) => ({ n, p, t: (p.finishedAt ?? ctx.now) - (p.startedAt ?? ctx.now) + p.hints * HINT_PENALTY }))
    .sort((a, b) => b.p.step - a.p.step || a.t - b.t);
  return ["HUNT STANDINGS", ...rows.map((r, k) => `${k + 1}. ${r.n} ${r.p.step}/${state.clues.length}${r.p.finishedAt ? ` ✓ ${formatDuration(r.t)}` : ""}${r.p.hints ? ` (${r.p.hints} hints)` : ""}`)];
}

export default {
  id: "scavenger",
  name: "Scavenger Hunt",
  channel: "#hunt",
  summary: "clues lead to physical spots; post the code you find there",
  kind: "tool",
  minPlayers: 1,
  maxPlayers: 99,

  create: (ctx, o) => ({ clues: o.hunt?.length ? o.hunt : DEMO_HUNT, progress: {}, finishers: 0 }),

  start(ctx, state) {
    ctx.say(`SCAVENGER HUNT · ${state.clues.length} clues · /clue  /found CODE  /hint (+1m)`);
  },

  onJoin(ctx, state, nick) {
    const p = progress(state, nick);
    if (p.startedAt == null) p.startedAt = ctx.now;
  },

  snapshot(ctx, state, nick) {
    const p = progress(state, nick);
    if (p.step >= state.clues.length) return ["you've finished the hunt 🎉"];
    return [`clue ${p.step + 1}/${state.clues.length}: ${state.clues[p.step].clue}`];
  },

  commands: [
    { name: "clue", usage: "clue", desc: "your current clue", readOnly: true, run: (ctx, state, nick) => (progress(state, nick).step < state.clues.length ? sendClue(ctx, state, nick) : ctx.dm(nick, "done!")) },
    {
      name: "found",
      usage: "found CODE",
      desc: "submit the code at the spot",
      run(ctx, state, nick, args) {
        const p = progress(state, nick);
        if (p.step >= state.clues.length) return ctx.dm(nick, "you already finished");
        const guess = String(args.join("")).toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (guess !== state.clues[p.step].code.toUpperCase()) {
          ctx.cooldown(nick, 10000);
          return ctx.dm(nick, "✗ that's not the code here (10s cooldown)");
        }
        p.step++;
        if (p.step === state.clues.length) {
          p.finishedAt = ctx.now;
          state.finishers++;
          const place = ["🥇", "🥈", "🥉"][state.finishers - 1] || `#${state.finishers}`;
          ctx.say(`${place} ${nick} finished the hunt in ${formatDuration(p.finishedAt - p.startedAt + p.hints * HINT_PENALTY)}!`);
        } else {
          ctx.say(`📍 ${nick} found spot ${p.step}/${state.clues.length}`);
          sendClue(ctx, state, nick);
        }
      },
    },
    {
      name: "hint",
      usage: "hint",
      desc: "get a hint (+1 minute)",
      run(ctx, state, nick) {
        const p = progress(state, nick);
        const c = state.clues[p.step];
        if (!c) return;
        p.hints++;
        ctx.dm(nick, `hint: ${c.hint || "no hint for this one"} (+1m)`);
      },
    },
    { name: "standings", aliases: ["score"], usage: "standings", desc: "who's where", readOnly: true, run: (ctx, state) => ctx.sayLines(leaderboard(ctx, state)) },
  ],

  bot(ctx, state, nick) {
    const p = progress(state, nick);
    if (p.step >= state.clues.length || !ctx.rng.chance(0.25)) return null;
    if (ctx.rng.chance(0.1)) return "/hint";
    return ctx.rng.chance(0.85) ? `/found ${state.clues[p.step].code}` : "/found WRONGSPOT";
  },
};
