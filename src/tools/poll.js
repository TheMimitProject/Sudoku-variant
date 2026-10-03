// Mesh Poll — the Mesh Hunt vote logic, generalized for real decisions:
// where to regroup, which stage next, whether to leave now.

import { parseDuration, formatDuration } from "../engine/commands.js";

function results(state, poll) {
  const counts = poll.options.map(() => 0);
  Object.values(poll.votes).forEach((k) => counts[k]++);
  const total = counts.reduce((a, b) => a + b, 0);
  return [
    `POLL #${poll.id}${poll.closed ? " (closed)" : ""}: ${poll.question}`,
    ...poll.options.map((o, k) => {
      const pct = total ? Math.round((counts[k] / total) * 100) : 0;
      return `${k + 1}. ${o} — ${counts[k]} (${pct}%) ${"█".repeat(Math.round(pct / 10))}`;
    }),
    `${total} vote${total === 1 ? "" : "s"}`,
  ];
}

function close(ctx, state, poll) {
  if (poll.closed) return;
  poll.closed = true;
  ctx.sayLines(results(state, poll));
}

export default {
  id: "poll",
  name: "Mesh Poll",
  channel: "#mesh",
  summary: "quick group decisions over the mesh",
  kind: "tool",
  minPlayers: 1,
  maxPlayers: 99,

  create: () => ({ polls: [], next: 1 }),

  start(ctx) {
    ctx.say("MESH POLL · /poll new [5m] Question? | option | option");
  },

  snapshot(ctx, state) {
    const open = state.polls.filter((p) => !p.closed);
    return open.length ? open.flatMap((p) => results(state, p)) : ["no open polls"];
  },

  commands: [
    {
      name: "poll new",
      usage: "poll new [5m] Where to meet? | north gate | food court",
      desc: "start a poll (optional auto-close time)",
      run(ctx, state, nick, args) {
        let words = args;
        let ms = null;
        if (words[0] && /^\d+(m|s|m\d+s)?$/i.test(words[0]) && words.join(" ").includes("|")) {
          ms = parseDuration(words[0], null);
          words = words.slice(1);
        }
        const parts = words.join(" ").split("|").map((s) => s.trim()).filter(Boolean);
        if (parts.length < 3) return ctx.dm(nick, "usage: /poll new Question? | option 1 | option 2");
        const poll = { id: state.next++, by: nick, question: parts[0], options: parts.slice(1, 10), votes: {}, closed: false };
        state.polls.push(poll);
        ctx.say(`📊 POLL #${poll.id} by ${nick}: ${poll.question}${ms ? ` (closes in ${formatDuration(ms)})` : ""}`);
        poll.options.forEach((o, k) => ctx.say(`  ${k + 1}. ${o}`));
        ctx.say(`vote: /poll vote ${poll.id} <number>`);
        if (ms) ctx.after(ms, () => close(ctx, state, poll));
      },
    },
    {
      name: "poll vote",
      aliases: ["vote"],
      usage: "poll vote [#id] <number>",
      desc: "vote (you can change it until it closes)",
      run(ctx, state, nick, args) {
        const nums = args.map((a) => Number(String(a).replace("#", ""))).filter((n) => !Number.isNaN(n));
        const open = state.polls.filter((p) => !p.closed);
        const poll = nums.length > 1 ? state.polls.find((p) => p.id === nums[0]) : open[open.length - 1];
        const choice = nums[nums.length - 1];
        if (!poll || poll.closed) return ctx.dm(nick, "no such open poll");
        if (!(choice >= 1 && choice <= poll.options.length)) return ctx.dm(nick, `pick 1–${poll.options.length}`);
        const changed = poll.votes[nick] != null;
        poll.votes[nick] = choice - 1;
        ctx.say(`#${poll.id}: ${changed ? "vote changed" : "vote in"} from ${nick}`);
      },
    },
    {
      name: "poll results",
      aliases: ["results"],
      usage: "poll results [#id]",
      desc: "current tally",
      readOnly: true,
      run(ctx, state, nick, args) {
        const id = Number(String(args[0] || "").replace("#", ""));
        const poll = id ? state.polls.find((p) => p.id === id) : state.polls[state.polls.length - 1];
        if (!poll) return ctx.dm(nick, "no polls yet");
        ctx.sayLines(results(state, poll));
      },
    },
    {
      name: "poll close",
      usage: "poll close [#id]",
      desc: "close your poll",
      run(ctx, state, nick, args) {
        const id = Number(String(args[0] || "").replace("#", ""));
        const poll = id ? state.polls.find((p) => p.id === id) : [...state.polls].reverse().find((p) => p.by === nick && !p.closed);
        if (!poll) return ctx.dm(nick, "no open poll of yours");
        if (poll.by !== nick) return ctx.dm(nick, `only ${poll.by} can close #${poll.id}`);
        close(ctx, state, poll);
      },
    },
  ],

  bot(ctx, state, nick) {
    const open = state.polls.filter((p) => !p.closed && p.votes[nick] == null);
    if (!open.length) return null;
    const p = ctx.rng.pick(open);
    return `/poll vote ${p.id} ${ctx.rng.int(p.options.length) + 1}`;
  },
};
