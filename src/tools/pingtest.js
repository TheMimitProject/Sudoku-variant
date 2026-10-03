// Mesh Ping Test — map how good your local mesh actually is before a game.
// The host broadcasts numbered PING packets; everyone answers with the numbers
// they received. The report shows loss and response time per node.

import { formatDuration } from "../engine/commands.js";
import { makeRecord } from "../uplink/records.js";
import { parseLocation, coarsen } from "../uplink/geohash.js";
import { shortId } from "../uplink/mesh.js";

/** Parse "3", "1-10", "1,2,5-7" into a set of numbers. */
export function parseRanges(text) {
  const out = new Set();
  for (const part of String(text).split(/[,\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) continue;
    const a = Number(m[1]), b = Number(m[2] ?? m[1]);
    for (let k = Math.min(a, b); k <= Math.max(a, b) && k - a < 1000; k++) out.add(k);
  }
  return out;
}

function nodeStats(state, n, r) {
  const loss = Math.round((1 - r.ids.size / Math.max(1, state.sent)) * 100);
  const rtts = [...r.rtts].sort((a, b) => a - b);
  const med = rtts.length ? rtts[Math.floor(rtts.length / 2)] : null;
  return { n, loss, med, hops: r.hops, geo: r.geo };
}

function report(ctx, state) {
  const nodes = Object.entries(state.got);
  if (!state.sent) return ["no probe run yet — /probe start 10"];
  const lines = [`PROBE REPORT · ${state.sent} packets sent`];
  if (!nodes.length) lines.push("no replies yet");
  nodes
    .map(([n, r]) => nodeStats(state, n, r))
    .sort((a, b) => a.loss - b.loss)
    .forEach(({ n, loss, med, hops }) => {
      const grade = loss <= 10 ? "🟢" : loss <= 35 ? "🟡" : "🔴";
      lines.push(`${grade} ${n}: ${100 - loss}% received${med != null ? ` · ~${formatDuration(med)} reply` : ""}${hops ? ` · ${hops} hops` : ""}`);
    });
  const silent = ctx.players().filter((n) => n !== state.host && !state.got[n]);
  if (silent.length) lines.push(`no reply: ${silent.join(", ")}`);
  return lines;
}

export default {
  id: "pingtest",
  name: "Mesh Ping Test",
  channel: "#ping",
  summary: "measure packet loss and reply time across the mesh",
  kind: "tool",
  minPlayers: 1,
  maxPlayers: 99,

  create: (ctx, o) => ({ host: o.host || null, sent: 0, sentAt: {}, got: {}, running: false, intervalMs: o.intervalMs ?? 3000 }),

  start(ctx) {
    ctx.say("MESH PING TEST · host: /probe start 10 · everyone: /pong <numbers you saw>, e.g. /pong 1-4,6");
  },

  snapshot: (ctx, state) => report(ctx, state),

  commands: [
    {
      name: "probe start",
      usage: "probe start [count]",
      desc: "host: send numbered PING packets",
      run(ctx, state, nick, args) {
        if (state.running) return ctx.dm(nick, "probe already running");
        const count = Math.min(50, Math.max(1, Number(args[0]) || 10));
        Object.assign(state, { host: nick, sent: 0, sentAt: {}, got: {}, running: true, count });
        ctx.say(`📡 probe: ${count} packets, one every ${formatDuration(state.intervalMs)} — reply /pong with the numbers you see`);
        for (let k = 1; k <= count; k++) {
          ctx.after(k * state.intervalMs, () => {
            state.sent = k;
            state.sentAt[k] = ctx.now;
            ctx.say(`PING ${String(k).padStart(2, "0")}`);
            if (k === count) {
              state.running = false;
              ctx.after(state.intervalMs * 2, () => ctx.sayLines(report(ctx, state)));
            }
          });
        }
      },
    },
    {
      name: "pong",
      usage: "pong 1-4,6 [hops N] [@location]",
      desc: "report which PINGs reached you",
      run(ctx, state, nick, args) {
        const at = args.find((a) => a.startsWith("@"));
        const geo = at ? parseLocation(at.slice(1)) : null;
        args = args.filter((a) => a !== at);
        const hopIdx = args.findIndex((a) => a.toLowerCase() === "hops");
        const hops = hopIdx >= 0 ? Number(args[hopIdx + 1]) || null : null;
        const ids = parseRanges((hopIdx >= 0 ? args.slice(0, hopIdx) : args).join(","));
        const r = (state.got[nick] ||= { ids: new Set(), rtts: [], hops: null });
        for (const id of ids) {
          if (id > state.sent || r.ids.has(id)) continue;
          r.ids.add(id);
          r.rtts.push(ctx.now - state.sentAt[id]);
        }
        if (hops) r.hops = hops;
        if (geo) r.geo = geo;
      },
    },
    {
      name: "up probe",
      usage: "up probe",
      desc: "host: upload the coverage report (nodes that shared a location) to the web map",
      run(ctx, state, nick) {
        if (!state.sent) return ctx.dm(nick, "run /probe start first");
        const located = Object.entries(state.got).filter(([, r]) => r.geo);
        if (!located.length) return ctx.dm(nick, "no node shared a location — they can add @geohash to /pong");
        for (const [n, r] of located) {
          const st = nodeStats(state, n, r);
          const record = makeRecord({
            type: "coverage", geo: coarsen(r.geo, "area"), precision: "area", nick: n, ts: Math.floor(ctx.now / 1000),
            note: `${100 - st.loss}% received${st.med != null ? `, ~${formatDuration(st.med)} reply` : ""}${st.hops ? `, ${st.hops} hops` : ""}`,
            data: { received: 100 - st.loss, replyMs: st.med, hops: st.hops || null, packets: state.sent },
          });
          ctx.uplink(record);
        }
        ctx.say(`📡 coverage for ${located.length} node${located.length > 1 ? "s" : ""} queued for upload`);
      },
    },
    { name: "probe report", aliases: ["report"], usage: "probe report", desc: "loss and timing per node", readOnly: true, run: (ctx, state) => ctx.sayLines(report(ctx, state)) },
  ],

  bot(ctx, state, nick) {
    if (!state.sent || nick === state.host) return null;
    // Each simulated node has a stable link quality.
    state.quality ||= {};
    state.quality[nick] ??= 0.5 + ctx.rng() * 0.5;
    const seen = (state.botSeen ||= {});
    const mine = (seen[nick] ||= new Set());
    const fresh = [];
    for (let k = 1; k <= state.sent; k++) {
      if (mine.has(k)) continue;
      mine.add(k);
      if (ctx.rng() < state.quality[nick]) fresh.push(k);
    }
    state.botGeo ||= {};
    state.botGeo[nick] ??= `dr5ru${"bcdefg"[ctx.rng.int(6)]}${"hjkmn"[ctx.rng.int(5)]}${"pqrst"[ctx.rng.int(5)]}`;
    return fresh.length ? `/pong ${fresh.join(",")}${mine.size === fresh.length ? ` @${state.botGeo[nick]}` : ""}` : null;
  },
};
