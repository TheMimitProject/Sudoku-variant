// Check-in Board — who's safe, who needs help, who's on the way.
// For hikes, festivals and drills where the phone network is down.

import { formatDuration, cleanNick } from "../engine/commands.js";

const ICON = { safe: "🟢 safe", help: "🔴 NEEDS HELP", enroute: "🟡 en route", unknown: "⚪ no word" };

function roster(ctx, state) {
  const names = [...new Set([...state.expected, ...Object.keys(state.status)])];
  if (!names.length) return ["roster empty — /safe, /sos, /enroute, or /expect names"];
  const order = { help: 0, unknown: 1, enroute: 2, safe: 3 };
  const rows = names
    .map((n) => ({ n, s: state.status[n] || { kind: "unknown" } }))
    .sort((a, b) => order[a.s.kind] - order[b.s.kind] || a.n.localeCompare(b.n));
  const counts = rows.reduce((m, r) => ((m[r.s.kind] = (m[r.s.kind] || 0) + 1), m), {});
  return [
    `ROSTER · ${counts.safe || 0} safe · ${counts.enroute || 0} en route · ${counts.help || 0} help · ${counts.unknown || 0} no word`,
    ...rows.map(({ n, s }) => `${ICON[s.kind]} ${n}${s.note ? ` — ${s.note}` : ""}${s.at != null ? ` (${formatDuration(ctx.now - s.at)} ago)` : ""}`),
  ];
}

function setStatus(kind) {
  return (ctx, state, nick, args) => {
    const note = args.join(" ").slice(0, 80);
    state.status[nick] = { kind, note, at: ctx.now };
    ctx.say(`${ICON[kind]} ${nick}${note ? ` — ${note}` : ""}`);
    if (kind === "help") ctx.say(`⚠️ ${nick} needs help. Anyone nearby: /omw ${nick}`);
  };
}

export default {
  id: "checkin",
  name: "Check-in Board",
  channel: "#checkin",
  summary: "safe / needs help / en route roster that works offline",
  kind: "tool",
  minPlayers: 1,
  maxPlayers: 200,

  create: (ctx, o) => ({ status: {}, expected: o.expected || [] }),

  start(ctx) {
    ctx.say("CHECK-IN BOARD · /safe  /sos <where/what>  /enroute <eta>  /roster");
  },

  snapshot: (ctx, state) => roster(ctx, state),

  commands: [
    { name: "safe", usage: "safe [note]", desc: "mark yourself safe", run: setStatus("safe") },
    { name: "sos", usage: "sos <where/what>", desc: "ask for help", run: setStatus("help") },
    { name: "enroute", aliases: ["eta"], usage: "enroute [eta]", desc: "on your way", run: setStatus("enroute") },
    {
      name: "omw",
      usage: "omw <nick>",
      desc: "tell someone who needs help you're coming",
      run(ctx, state, nick, args) {
        const who = cleanNick(args[0]);
        if (state.status[who]?.kind !== "help") return ctx.dm(nick, `${who || "?"} hasn't asked for help`);
        (state.status[who].responders ||= new Set()).add(nick);
        ctx.say(`🏃 ${nick} is heading to ${who} (${state.status[who].responders.size} responding)`);
      },
    },
    {
      name: "expect",
      usage: "expect <nick> [nick…]",
      desc: "add people you're waiting to hear from",
      run(ctx, state, nick, args) {
        const names = args.map(cleanNick).filter(Boolean);
        state.expected.push(...names.filter((n) => !state.expected.includes(n)));
        ctx.say(`expecting: ${state.expected.join(", ")}`);
      },
    },
    { name: "roster", aliases: ["board", "status"], usage: "roster", desc: "show everyone", readOnly: true, run: (ctx, state) => ctx.sayLines(roster(ctx, state)) },
  ],

  bot(ctx, state, nick) {
    if (state.status[nick]) {
      const helpless = Object.entries(state.status).find(([n, s]) => s.kind === "help" && n !== nick && !s.responders?.has(nick));
      if (helpless && ctx.rng.chance(0.3)) return `/omw ${helpless[0]}`;
      return null;
    }
    const r = ctx.rng();
    if (r < 0.6) return "/safe at the meeting point";
    if (r < 0.9) return `/enroute ${5 + ctx.rng.int(20)} min`;
    return "/sos twisted ankle near the east trail";
  },
};
