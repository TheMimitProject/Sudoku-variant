// Mesh Hunt — social deduction. Find the Jammer before the mesh collapses.
//
// Night: the Jammer picks a node to jam; Signals may run a relay check; with 7+
// players a Booster protects one node and a Scanner learns one role.
// Dawn: the host reports whose relay failed. A node jammed twice drops off.
// Day: discuss and /vote. Most votes is disconnected (ties: nobody).
// Signals win when every Jammer is out; Jammers win when they match the Signals.

import { cleanNick, formatDuration } from "../engine/commands.js";

export const ROLES = { signal: "🟢 Signal", jammer: "🔴 Jammer", booster: "🔵 Booster", scanner: "🟣 Scanner" };
const JAM_SUCCESS = 0.65;
const JAMS_TO_DROP = 2;

const alive = (state) => state.order.filter((n) => state.alive[n]);
const isBad = (state, n) => state.role[n] === "jammer";

function winCheck(ctx, state) {
  const a = alive(state);
  const bad = a.filter((n) => isBad(state, n)).length;
  const good = a.length - bad;
  if (bad === 0) return finish(ctx, state, "signals");
  if (bad >= good) return finish(ctx, state, "jammer");
  return false;
}

function finish(ctx, state, winner) {
  state.phase = "over";
  state.winner = winner;
  ctx.end([
    winner === "signals" ? "🟢 THE MESH IS CLEAN — Signals win!" : "🔴 THE MESH IS COMPROMISED — Jammers win!",
    ...state.order.map((n) => `${n}: ${ROLES[state.role[n]]}${state.alive[n] ? "" : " (disconnected)"}`),
  ]);
  return true;
}

function startNight(ctx, state) {
  state.round++;
  state.phase = "night";
  state.night = { jam: {}, relay: {}, boost: {}, scan: {} };
  state.votes = {};
  ctx.say(`🌙 NIGHT ${state.round} — night actions by /msg host. Dawn in ${formatDuration(state.nightMs)} or when all are in.`);
  ctx.clearTimers();
  state.deadline = ctx.now + state.nightMs;
  ctx.after(state.nightMs, () => dawn(ctx, state));
}

/** Dawn comes early once every node has acted (signals act with /relay or /relay skip). */
function nightReady(state) {
  const key = { jammer: "jam", booster: "boost", scanner: "scan", signal: "relay" };
  return alive(state).every((n) => state.night[key[state.role[n]]][n]);
}

function dawn(ctx, state) {
  if (state.phase !== "night") return;
  ctx.clearTimers();
  const n = state.night;
  const boosted = new Set(Object.values(n.boost));
  const jammedNow = new Set();
  ctx.say(`🌅 DAWN ${state.round}`);
  const targets = Object.values(n.jam);
  if (!targets.length) ctx.say("All relays held overnight. No interference detected.");
  for (const t of new Set(targets)) {
    if (!state.alive[t]) continue;
    if (boosted.has(t)) {
      ctx.say(`⚡ Interference hit ${t}, but a booster held the link.`);
    } else if (ctx.rng.chance(JAM_SUCCESS)) {
      jammedNow.add(t);
      state.jams[t] = (state.jams[t] || 0) + 1;
      ctx.say(`📡 Relay disrupted: ${t} (${state.jams[t]}/${JAMS_TO_DROP})`);
    } else {
      ctx.say(`🔇 Someone tried to jam the mesh — the packet got through anyway.`);
    }
  }
  for (const [who, target] of Object.entries(n.relay)) {
    if (target === "skip") continue;
    ctx.dm(who, jammedNow.has(target) ? `relay via ${target}: ❌ packet lost` : `relay via ${target}: ✅ delivered`);
  }
  for (const [who, target] of Object.entries(n.scan)) {
    ctx.dm(who, `scan: ${target} is ${isBad(state, target) ? "a JAMMER" : "not a jammer"}`);
  }
  for (const t of jammedNow) {
    if (state.jams[t] >= JAMS_TO_DROP && state.alive[t]) {
      state.alive[t] = false;
      ctx.say(`💀 Jammed off the mesh: ${t} — ${ROLES[state.role[t]]}`);
    }
  }
  if (winCheck(ctx, state)) return;
  state.phase = "day";
  ctx.say(`☀️ DAY ${state.round} — discuss, then /vote <nick>. Votes close in ${formatDuration(state.dayMs)} or when everyone has voted.`);
  state.deadline = ctx.now + state.dayMs;
  ctx.after(state.dayMs, () => tally(ctx, state));
}

function tally(ctx, state) {
  if (state.phase !== "day") return;
  ctx.clearTimers();
  const counts = {};
  for (const [voter, t] of Object.entries(state.votes)) if (state.alive[voter] && state.alive[t]) counts[t] = (counts[t] || 0) + 1;
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  ctx.say(`🗳 VOTES: ${ranked.length ? ranked.map(([n, c]) => `${n}×${c}`).join(" ") : "none"}`);
  if (!ranked.length || (ranked[1] && ranked[1][1] === ranked[0][1])) {
    ctx.say("Tie — nobody is disconnected.");
  } else {
    const out = ranked[0][0];
    state.alive[out] = false;
    ctx.say(`🔌 Disconnected: ${out} — ${ROLES[state.role[out]]}`);
  }
  if (!winCheck(ctx, state)) startNight(ctx, state);
}

function deal(ctx, state) {
  const players = ctx.players();
  if (players.length < state.minPlayers) {
    ctx.say(`need ${state.minPlayers}+ players to start (have ${players.length})`);
    return;
  }
  state.order = ctx.rng.shuffle(players);
  const jammers = players.length >= 7 ? 2 : 1;
  const roles = Array(players.length).fill("signal");
  for (let i = 0; i < jammers; i++) roles[i] = "jammer";
  if (players.length >= 7 && state.advanced) {
    roles[jammers] = "booster";
    roles[jammers + 1] = "scanner";
  }
  const shuffledRoles = ctx.rng.shuffle(roles);
  state.order.forEach((n, i) => {
    state.role[n] = shuffledRoles[i];
    state.alive[n] = true;
  });
  const bad = state.order.filter((n) => isBad(state, n));
  state.order.forEach((n) => {
    ctx.dm(n, `ROLE: ${ROLES[state.role[n]]}`);
    if (isBad(state, n) && bad.length > 1) ctx.dm(n, `fellow jammers: ${bad.filter((b) => b !== n).join(", ")}`);
  });
  ctx.say(`MESH HUNT · ${players.length} nodes · ${jammers} jammer${jammers > 1 ? "s" : ""}${state.advanced && players.length >= 7 ? " · booster + scanner" : ""}`);
  startNight(ctx, state);
}

function nightAction(kind, role) {
  return (ctx, state, nick, args) => {
    if (state.phase !== "night") return ctx.dm(nick, "night actions only at night");
    if (!state.alive[nick]) return ctx.dm(nick, "you're disconnected — spectating");
    if (role && state.role[nick] !== role) return ctx.dm(nick, `only the ${role} can do that`);
    const t = cleanNick(args[0]);
    if (kind === "relay" && t.toLowerCase() === "skip") {
      state.night.relay[nick] = "skip";
      ctx.dm(nick, "no relay check tonight");
      if (nightReady(state)) dawn(ctx, state);
      return;
    }
    if (!state.alive[t]) return ctx.dm(nick, `${t || "?"} isn't an active node`);
    if (kind === "jam" && isBad(state, t)) return ctx.dm(nick, "you can't jam a fellow jammer");
    state.night[kind][nick] = t;
    ctx.dm(nick, `${kind} → ${t} locked in`);
    if (nightReady(state)) dawn(ctx, state);
  };
}

function vote(ctx, state, nick, args) {
  if (state.phase !== "day") return ctx.dm(nick, "voting opens at dawn");
  if (!state.alive[nick]) return ctx.dm(nick, "you're disconnected — spectating");
  const t = cleanNick(args[0]);
  if (!state.alive[t] || t === nick) return ctx.dm(nick, `can't vote for ${t || "?"}`);
  state.votes[nick] = t;
  ctx.say(`vote: ${nick} → ${t}`);
  if (alive(state).every((n) => state.votes[n])) tally(ctx, state);
}

const CHATTER = [
  (t) => `anyone else getting dropped packets?`,
  (t) => `${t} has been real quiet`,
  (t) => `my relay was clean last night`,
  (t) => `idk, ${t} seems sus`,
  (t) => `trust no one on this mesh`,
  (t) => `${t} why were you never jammed?`,
];

export default {
  id: "hunt",
  name: "Mesh Hunt",
  channel: "#meshhunt",
  summary: "social deduction — find the Jammer",
  minPlayers: 4,
  maxPlayers: 8,

  create(ctx, o) {
    return {
      phase: "lobby",
      round: 0,
      order: [],
      role: {},
      alive: {},
      jams: {},
      votes: {},
      night: null,
      winner: null,
      minPlayers: o.minPlayers ?? 4,
      advanced: o.advanced ?? true,
      nightMs: o.nightMs ?? 60000,
      dayMs: o.dayMs ?? 120000,
      autoStart: o.autoStart ?? 0,
    };
  },

  start(ctx, state) {
    ctx.say("MESH HUNT lobby — /join, then /hunt start (4–8 players)");
  },

  onJoin(ctx, state, nick) {
    if (state.phase !== "lobby") {
      if (state.alive[nick] == null) ctx.dm(nick, "game in progress — you're spectating until the next one");
      return;
    }
    if (state.autoStart && ctx.players().length >= state.autoStart) deal(ctx, state);
  },

  onChat(ctx, state, nick, text) {
    // Private messages to the host in the classic "JAM:target" format.
    const m = String(text).trim().match(/^(JAM|RELAY|BOOST|SCAN):\s*@?(\S+)$/i);
    if (!m) return;
    const kind = m[1].toLowerCase();
    const cmd = this.commands.find((c) => c.name === kind);
    cmd?.run(ctx, state, nick, [m[2]]);
  },

  snapshot(ctx, state, nick) {
    if (state.phase === "lobby") return [`lobby: ${ctx.players().join(", ")}`];
    const lines = [`${state.phase.toUpperCase()} ${state.round} · alive: ${alive(state).join(", ")}`];
    if (state.role[nick]) lines.push(`your role: ${ROLES[state.role[nick]]}${state.alive[nick] ? "" : " (disconnected)"}`);
    return lines;
  },

  commands: [
    { name: "hunt start", aliases: ["start"], usage: "hunt start", desc: "deal roles and begin", run: (ctx, state) => state.phase === "lobby" && deal(ctx, state) },
    { name: "jam", private: true, usage: "jam <nick>", desc: "jammer: disrupt a node tonight (send to host)", run: nightAction("jam", "jammer") },
    { name: "relay", private: true, usage: "relay <nick>", desc: "check your link through a node tonight", run: nightAction("relay", null) },
    { name: "boost", private: true, usage: "boost <nick>", desc: "booster: protect a node tonight", run: nightAction("boost", "booster") },
    { name: "scan", private: true, usage: "scan <nick>", desc: "scanner: learn if a node is a jammer", run: nightAction("scan", "scanner") },
    { name: "vote", usage: "vote <nick>", desc: "vote to disconnect a node", run: vote },
    { name: "slap", usage: "slap <nick>", desc: "dramatic accusation", readOnly: true, run: (ctx, s, nick, a) => ctx.say(`🫵 ${nick} points an antenna at ${cleanNick(a[0])}`) },
    { name: "hunt next", usage: "hunt next", desc: "host: skip the timer", hidden: true, run: (ctx, state) => (state.phase === "night" ? dawn(ctx, state) : state.phase === "day" && tally(ctx, state)) },
  ],

  bot(ctx, state, nick) {
    const rng = ctx.rng;
    if (state.phase === "lobby" || !state.alive[nick]) return null;
    const others = alive(state).filter((n) => n !== nick);
    if (!others.length) return null;
    const role = state.role[nick];
    if (state.phase === "night") {
      const key = { jammer: "jam", booster: "boost", scanner: "scan" }[role] || "relay";
      if (state.night[key][nick]) return null;
      const pool = role === "jammer" ? others.filter((n) => !isBad(state, n)) : others;
      if (!pool.length) return null;
      return `/${key} ${rng.pick(pool)}`;
    }
    if (state.phase === "day") {
      if (state.votes[nick]) return rng.chance(0.15) ? rng.pick(CHATTER)(rng.pick(others)) : null;
      if (rng.chance(0.35)) return rng.pick(CHATTER)(rng.pick(others));
      let target;
      if (role === "jammer") target = rng.pick(others.filter((n) => !isBad(state, n)) || others);
      else {
        // Suspect whoever has been jammed least; jammers never jam themselves.
        const minJams = Math.min(...others.map((n) => state.jams[n] || 0));
        const suspects = others.filter((n) => (state.jams[n] || 0) === minJams);
        target = rng.chance(0.7) ? rng.pick(suspects) : rng.pick(others);
      }
      return `/vote ${target || rng.pick(others)}`;
    }
    return null;
  },

  view(state, nick) {
    return {
      phase: state.phase,
      round: state.round,
      role: state.role[nick] || null,
      roleLabel: state.role[nick] ? ROLES[state.role[nick]] : null,
      meAlive: !!state.alive[nick],
      order: state.order,
      alive: { ...state.alive },
      jams: { ...state.jams },
      votes: { ...state.votes },
      myNight: state.night
        ? Object.fromEntries(Object.entries(state.night).map(([k, v]) => [k, v[nick] || null]))
        : null,
      winner: state.winner,
      deadline: state.deadline ?? null,
      revealed: state.phase === "over" ? { ...state.role } : Object.fromEntries(state.order.filter((n) => !state.alive[n]).map((n) => [n, state.role[n]])),
    };
  },
};
