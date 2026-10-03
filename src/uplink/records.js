// Uplink records: what leaves the mesh, how it's signed, and how it maps to Nostr.
//
//   mesh message   /up sos dr5regw3 twisted ankle ~mg2k1a.<pubkey>.<sig>
//   record         { type: "sos", geo: "dr5reg", note, ts, nick, author?, sig? }
//   nostr event    kind 4171, signed by the gateway, tagged for map queries
//
// The "~…" block is optional: it's added by the phone composer page so the
// sender's own key vouches for the message, not just the gateway that relayed it.

// This file has no crypto-library imports so games can create records cheaply;
// signing and Nostr conversion live in ./crypto.js.

import { sha256 } from "../engine/sha256.js";
import { coarsen, PRECISION, DEFAULT_PRECISION } from "./geohash.js";

export const UPLINK_KIND = 4171;
export const UPLINK_TAG = "meshuplink";

const H = 3600;
/** What can be uploaded, and how long it stays on the map unless refreshed. */
export const TYPES = {
  sos: { ttl: 6 * H, label: "SOS", icon: "🆘", color: "#ef4444", located: true },
  safe: { ttl: 24 * H, label: "Safe", icon: "🟢", color: "#22c55e", located: false },
  enroute: { ttl: 3 * H, label: "En route", icon: "🟡", color: "#eab308", located: false },
  water: { ttl: 24 * H, label: "Water", icon: "💧", color: "#38bdf8", located: true, report: true },
  food: { ttl: 24 * H, label: "Food", icon: "🍞", color: "#f59e0b", located: true, report: true },
  shelter: { ttl: 24 * H, label: "Shelter", icon: "⛺", color: "#a78bfa", located: true, report: true },
  medical: { ttl: 24 * H, label: "Medical aid", icon: "⛑️", color: "#f472b6", located: true, report: true },
  power: { ttl: 12 * H, label: "Power / charging", icon: "🔌", color: "#facc15", located: true, report: true },
  signal: { ttl: 12 * H, label: "Phone signal", icon: "📶", color: "#2dd4bf", located: true, report: true },
  blocked: { ttl: 12 * H, label: "Blocked road", icon: "⛔", color: "#fb923c", located: true, report: true },
  fire: { ttl: 6 * H, label: "Fire", icon: "🔥", color: "#f97316", located: true, report: true },
  flood: { ttl: 6 * H, label: "Flooding", icon: "🌊", color: "#3b82f6", located: true, report: true },
  hazard: { ttl: 6 * H, label: "Hazard", icon: "⚠️", color: "#fbbf24", located: true, report: true },
  coverage: { ttl: 24 * H, label: "Mesh coverage", icon: "📡", color: "#5eead4", located: true },
  daily: { ttl: 48 * H, label: "Daily puzzle", icon: "🧩", color: "#c4b5fd", located: false },
  hunt: { ttl: 24 * H, label: "Scavenger results", icon: "📍", color: "#fde68a", located: false },
  confirm: { ttl: 24 * H, label: "Confirmation", icon: "✔", color: "#94a3b8", located: false, meta: true },
  resolved: { ttl: 48 * H, label: "Resolved", icon: "✓", color: "#94a3b8", located: false, meta: true },
};
export const REPORT_TYPES = Object.keys(TYPES).filter((k) => TYPES[k].report);

export const hexToBytes = (h) => Uint8Array.from(h.match(/../g) || [], (x) => parseInt(x, 16));
export const bytesToHex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

/** The exact string a sender signs. */
export const canonical = ({ type, geo, note, ts }) => `meshup1|${type}|${geo || ""}|${note || ""}|${ts}`;

export const shortId = (id) => String(id).slice(0, 6);

// ------------------------------------------------------------------
// Records
// ------------------------------------------------------------------

/**
 * Stable id so several gateways relaying the same message collapse into one pin.
 * Signed records use the signature; unsigned ones bucket the time to 10 minutes.
 */
export function recordId(r) {
  const basis = r.sig ? `sig|${r.sig}` : `${r.type}|${r.geo}|${r.note}|${r.nick}|${Math.floor(r.ts / 600)}|${r.ref || ""}`;
  return sha256(basis).slice(0, 16);
}

/**
 * Build a record. `geo` is the full-precision hash the gateway saw; it's
 * coarsened here to the sender's chosen precision for publishing. Signed
 * records are published exactly as signed.
 */
export function makeRecord({ type, geo = "", precision = DEFAULT_PRECISION, note = "", ts, nick = "", author, sig, ref, data, drill = false }) {
  if (!TYPES[type]) throw new Error(`unknown uplink type "${type}"`);
  const signed = !!(author && sig);
  const r = {
    v: 1,
    type,
    geo: geo ? (signed ? geo : coarsen(geo, precision)) : "",
    precision: signed ? precisionOf(geo) : geo ? precision : null,
    note: String(note || "").slice(0, 140),
    ts: Math.floor(ts),
    nick,
    drill: !!drill,
  };
  if (signed) Object.assign(r, { author, sig });
  if (ref) r.ref = ref;
  if (data) r.data = data;
  r.id = recordId(r);
  return r;
}

export function precisionOf(geo) {
  if (!geo) return null;
  const n = geo.length;
  return n >= PRECISION.exact.chars ? "exact" : n >= PRECISION.area.chars ? "area" : "city";
}

export const expiresAt = (r) => r.ts + (TYPES[r.type]?.ttl ?? 6 * H);

// ------------------------------------------------------------------
// Turning a pile of records into what the map shows
// ------------------------------------------------------------------

/**
 * Collapse duplicates from several gateways, apply resolutions and
 * confirmations, and mark expired items.
 */
export function aggregate(records, now = Math.floor(Date.now() / 1000)) {
  const items = new Map();
  const metas = [];
  for (const r of records) {
    if (TYPES[r.type]?.meta) {
      metas.push(r);
      continue;
    }
    const it = items.get(r.id);
    if (it) {
      if (r.gateway) it.gateways.add(r.gateway);
      continue;
    }
    items.set(r.id, { record: r, gateways: new Set(r.gateway ? [r.gateway] : []), confirmers: new Set(), resolved: false, nearby: 0 });
  }
  for (const m of metas) {
    const it = items.get(m.ref);
    if (!it) continue;
    const sameSender = it.record.author ? m.author === it.record.author : m.nick && m.nick === it.record.nick;
    if (m.type === "resolved" && sameSender) it.resolved = true;
    if (m.type === "confirm" && !sameSender) it.confirmers.add(m.author || m.nick);
  }
  // Independent reports of the same thing in the same ~1 km cell back each other up.
  const list = [...items.values()];
  for (const a of list) {
    if (!TYPES[a.record.type].report || !a.record.geo) continue;
    const cell = a.record.geo.slice(0, 6);
    a.nearby = list.filter((b) => b !== a && b.record.type === a.record.type && b.record.geo.slice(0, 6) === cell && b.record.nick !== a.record.nick).length;
  }
  return list
    .map((it) => ({
      ...it,
      gateways: it.gateways.size,
      confirms: it.confirmers.size + it.nearby,
      expired: expiresAt(it.record) < now,
      age: now - it.record.ts,
    }))
    .sort((a, b) => (a.record.type === "sos" ? -1 : 0) - (b.record.type === "sos" ? -1 : 0) || b.record.ts - a.record.ts);
}
