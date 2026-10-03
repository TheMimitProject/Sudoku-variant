// Check-in Board — who's safe, who needs help, who's on the way — plus
// location reports and the opt-in uplink to the web.
//
// Plain commands stay on the mesh:        /safe  /sos …  /enroute …  /report water …
// Prefix with /up to also upload them:    /up safe  /up sos @dr5regw3 …  /up report fire …
// Nothing leaves the mesh without /up.

import { formatDuration, cleanNick } from "../engine/commands.js";
import { parseUpArgs, recordFromArgs, shortId } from "../uplink/mesh.js";
import { TYPES, REPORT_TYPES } from "../uplink/records.js";
import { signBlock } from "../uplink/crypto.js";
import { PRECISION, encode, decode } from "../uplink/geohash.js";
import { parsePubkey } from "../uplink/nostr-keys.js";

const ICON = { safe: "🟢 safe", help: "🔴 NEEDS HELP", enroute: "🟡 en route", unknown: "⚪ no word" };
const KIND_TO_TYPE = { safe: "safe", help: "sos", enroute: "enroute" };

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
    ...rows.map(
      ({ n, s }) =>
        `${ICON[s.kind]} ${n}${s.note ? ` — ${s.note}` : ""}${s.geo ? ` @${s.geo}` : ""}${s.at != null ? ` (${formatDuration(ctx.now - s.at)} ago)` : ""}${s.uploaded ? " 📡" : ""}`
    ),
  ];
}

function reportLines(ctx, state) {
  const live = state.reports.filter((r) => !r.resolved);
  if (!live.length) return ["no reports — /report water|shelter|fire|… [@location] [note]"];
  return [
    "REPORTS",
    ...live.map(
      (r) =>
        `${TYPES[r.type].icon} ${shortId(r.id)} ${TYPES[r.type].label}${r.geo ? ` @${r.geo}` : ""}${r.note ? ` — ${r.note}` : ""} · ${r.nick}${r.confirms.size ? ` · ✔${r.confirms.size}` : ""}${r.uploaded ? " 📡" : ""} (${formatDuration(ctx.now - r.at)} ago)`
    ),
  ];
}

/** Queue a record for the gateway and tell the sender what will be public. */
function upload(ctx, state, nick, type, parsed, extra = {}) {
  const built = recordFromArgs(type, parsed, { nick, now: ctx.now, ...extra });
  if (built.error) {
    ctx.dm(nick, `✗ ${built.error}`);
    return null;
  }
  const { record, exactGeo } = built;
  const contacts = state.contacts[nick] || [];
  ctx.uplink(record, { exactGeo: contacts.length ? exactGeo : undefined, contacts });
  const where = record.geo ? ` · public location ${PRECISION[record.precision]?.radius || ""} (${record.precision})` : "";
  const dm = contacts.length && exactGeo ? ` · exact location to ${contacts.length} contact${contacts.length > 1 ? "s" : ""}` : "";
  ctx.dm(nick, `📡 queued for upload: ${TYPES[type].label}${where}${dm}${record.author ? " · signed ✓" : ""}${record.drill ? " · DRILL" : ""} · id ${shortId(record.id)}`);
  return record;
}

function setStatus(kind, up) {
  return (ctx, state, nick, args) => {
    const parsed = parseUpArgs(args);
    const note = parsed.note.slice(0, 80);
    const record = up ? upload(ctx, state, nick, KIND_TO_TYPE[kind], parsed) : null;
    if (up && !record) return;
    state.status[nick] = { kind, note, at: ctx.now, geo: parsed.geo ? parsed.geo.slice(0, 6) : null, uploaded: !!record, id: record?.id };
    ctx.say(`${ICON[kind]} ${nick}${note ? ` — ${note}` : ""}${record ? " 📡" : ""}`);
    if (kind === "help") ctx.say(`⚠️ ${nick} needs help. Anyone nearby: /omw ${nick}`);
  };
}

function report(up) {
  return (ctx, state, nick, args) => {
    const type = String(args[0] || "").toLowerCase();
    if (!REPORT_TYPES.includes(type)) return ctx.dm(nick, `report what? ${REPORT_TYPES.join(" | ")}`);
    const parsed = parseUpArgs(args.slice(1));
    const record = up ? upload(ctx, state, nick, type, parsed) : null;
    if (up && !record) return;
    const id = record?.id || recordFromArgs(type, parsed, { nick, now: ctx.now }).record?.id;
    state.reports.push({ id, type, geo: parsed.geo ? parsed.geo.slice(0, 6) : null, note: parsed.note, nick, at: ctx.now, confirms: new Set(), uploaded: !!record });
    ctx.say(`${TYPES[type].icon} ${nick} reports ${TYPES[type].label.toLowerCase()}${parsed.geo ? ` @${parsed.geo.slice(0, 6)}` : ""}${parsed.note ? `: ${parsed.note}` : ""} · id ${shortId(id)}${record ? " 📡" : ""}`);
  };
}

function findById(state, prefix) {
  const p = String(prefix || "").toLowerCase();
  if (p.length < 3) return null;
  const pool = [...state.reports, ...Object.entries(state.status).filter(([, s]) => s.id).map(([n, s]) => ({ id: s.id, nick: n, type: KIND_TO_TYPE[s.kind], status: s }))];
  return pool.find((r) => r.id && r.id.startsWith(p)) || null;
}

function confirmOrResolve(type, up) {
  return (ctx, state, nick, args) => {
    const item = findById(state, args[0]);
    if (!item) return ctx.dm(nick, `no report or status with id ${args[0] || "?"}`);
    if (type === "confirm") {
      if (item.nick === nick) return ctx.dm(nick, "you can't confirm your own report");
      item.confirms?.add(nick);
      ctx.say(`✔ ${nick} confirms ${shortId(item.id)}${item.confirms ? ` (${item.confirms.size})` : ""}`);
    } else {
      if (item.nick !== nick) return ctx.dm(nick, `only ${item.nick} can mark ${shortId(item.id)} resolved`);
      if (item.status) state.status[nick] = { kind: "safe", note: "resolved", at: ctx.now };
      else item.resolved = true;
      ctx.say(`✓ ${shortId(item.id)} resolved by ${nick}`);
    }
    if (up) upload(ctx, state, nick, type, parseUpArgs(args.slice(1)), { ref: item.id });
  };
}

function statusCommands(up) {
  const p = up ? "up " : "";
  const upDesc = up ? " and upload it" : "";
  return [
    { name: `${p}safe`, usage: `${p}safe [@location] [note]`, desc: `mark yourself safe${upDesc}`, run: setStatus("safe", up) },
    { name: `${p}sos`, usage: `${p}sos [@location] [!exact|!area|!city] <what>`, desc: `ask for help${upDesc}`, run: setStatus("help", up) },
    { name: `${p}enroute`, aliases: up ? [] : ["eta"], usage: `${p}enroute [eta]`, desc: `on your way${upDesc}`, run: setStatus("enroute", up) },
    { name: `${p}report`, usage: `${p}report <water|shelter|fire|…> [@location] [note]`, desc: `report a resource or hazard${upDesc}`, run: report(up) },
    { name: `${p}confirm`, usage: `${p}confirm <id>`, desc: `back up someone else's report${upDesc}`, run: confirmOrResolve("confirm", up) },
    { name: `${p}resolved`, usage: `${p}resolved <id>`, desc: `mark your SOS or report resolved${upDesc}`, run: confirmOrResolve("resolved", up) },
  ];
}

/** A stable fake position near the simulation centre for each bot. */
function botSpot(ctx, state, nick) {
  state.botSpots ||= {};
  if (!state.botSpots[nick]) {
    const c = decode(state.center);
    state.botSpots[nick] = encode(c.lat + (ctx.rng() - 0.5) * 0.02, c.lon + (ctx.rng() - 0.5) * 0.025, 8);
  }
  return state.botSpots[nick];
}

function botKey(ctx, state, nick) {
  state.botKeys ||= {};
  if (!state.botKeys[nick]) state.botKeys[nick] = Uint8Array.from({ length: 32 }, () => 1 + ctx.rng.int(254));
  return state.botKeys[nick];
}

export default {
  id: "checkin",
  name: "Check-in Board",
  channel: "#checkin",
  summary: "safe / needs help / en route roster, location reports, opt-in upload to the web",
  kind: "tool",
  minPlayers: 1,
  maxPlayers: 200,

  create: (ctx, o) => ({
    status: {},
    reports: [],
    contacts: {},
    expected: o.expected || [],
    center: o.center || "dr5ruzb8", // simulation only: where bots stand
  }),

  start(ctx) {
    ctx.say("CHECK-IN BOARD · /safe  /sos <what>  /enroute <eta>  /report water|fire|…  /roster");
    ctx.say("add /up in front to upload to the web map, e.g. /up sos @dr5regw3 twisted ankle");
  },

  snapshot: (ctx, state) => roster(ctx, state),

  commands: [
    ...statusCommands(false),
    ...statusCommands(true),
    {
      name: "up contact",
      usage: "up contact <npub…> | clear",
      desc: "send your exact location privately to this person whenever you upload",
      run(ctx, state, nick, args) {
        if (String(args[0]).toLowerCase() === "clear") {
          delete state.contacts[nick];
          return ctx.dm(nick, "contacts cleared");
        }
        const pk = parsePubkey(args[0]);
        if (!pk) return ctx.dm(nick, "usage: /up contact npub1… (their Nostr public key)");
        const list = (state.contacts[nick] ||= []);
        if (!list.includes(pk)) list.push(pk);
        ctx.dm(nick, `✓ ${list.length} contact${list.length > 1 ? "s" : ""} will get your exact location by encrypted DM`);
      },
    },
    { name: "up status", usage: "up status", desc: "what the gateway is holding", readOnly: true, run: (ctx, state, nick) => ctx.dm(nick, ctx.uplinkStatus()) },
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
    { name: "reports", usage: "reports", desc: "resources and hazards", readOnly: true, run: (ctx, state) => ctx.sayLines(reportLines(ctx, state)) },
  ],

  /** Simulated people: check in, report what they see, sometimes sign with their own key. */
  bot(ctx, state, nick) {
    const rng = ctx.rng;
    const spot = botSpot(ctx, state, nick);
    const sign = (type, geo, note) => {
      const ts = Math.floor(ctx.now / 1000);
      return `${geo ? `@${geo} ` : ""}${note} ${signBlock({ type, geo, note, ts }, botKey(ctx, state, nick))}`.trim();
    };
    if (!state.status[nick]) {
      const r = rng();
      if (r < 0.55) return rng.chance(0.5) ? `/up safe ${sign("safe", spot.slice(0, 6), "at the meeting point")}` : "/up safe @" + spot + " at the meeting point";
      if (r < 0.85) return `/up enroute ${5 + rng.int(20)} min`;
      return `/up sos @${spot} !exact twisted ankle near the east trail`;
    }
    const sos = Object.entries(state.status).find(([n, s]) => s.kind === "help" && n !== nick && !s.responders?.has(nick));
    if (sos && rng.chance(0.3)) return `/omw ${sos[0]}`;
    const others = state.reports.filter((r) => r.nick !== nick && !r.confirms.has(nick) && !r.resolved);
    if (others.length && rng.chance(0.25)) return `/up confirm ${shortId(rng.pick(others).id)}`;
    state.botReported ||= {};
    const seen = (state.botReported[nick] ||= new Set());
    const fresh = ["water", "shelter", "blocked", "power", "medical", "hazard", "signal"].filter((t) => !seen.has(t));
    if (fresh.length && rng.chance(0.18)) {
      const type = rng.pick(fresh);
      seen.add(type);
      const notes = { water: "tap works at the library", shelter: "school gym is open", blocked: "tree down across the road", power: "cafe has a generator, charging ok", medical: "first aid tent by the stage", hazard: "downed power line", signal: "1 bar on the hill" };
      return rng.chance(0.4) ? `/up report ${type} ${sign(type, spot.slice(0, 7), notes[type])}` : `/up report ${type} @${spot} ${notes[type]}`;
    }
    return null;
  },

  view(state) {
    return { status: state.status, reports: state.reports };
  },
};
