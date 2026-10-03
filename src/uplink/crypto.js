// Signing and Nostr conversion for uplink records.

import { schnorr } from "@noble/curves/secp256k1.js";
import { finalizeEvent, verifyEvent, getPublicKey } from "nostr-tools";
import { prefixes } from "./geohash.js";
import { TYPES, UPLINK_KIND, UPLINK_TAG, canonical, recordId, expiresAt, hexToBytes, bytesToHex } from "./records.js";

// ------------------------------------------------------------------
// Sender signatures (the "~ts.pub.sig" block on the mesh)
// ------------------------------------------------------------------

const b64u = {
  enc(bytes) {
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
  dec(str) {
    const s = atob(str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4));
    return Uint8Array.from(s, (c) => c.charCodeAt(0));
  },
};


export function signBlock(fields, secretKey) {
  const sk = typeof secretKey === "string" ? hexToBytes(secretKey) : secretKey;
  const msg = new TextEncoder().encode(canonical(fields));
  const sig = schnorr.sign(msg, sk);
  const pub = schnorr.getPublicKey(sk);
  return `~${fields.ts.toString(36)}.${b64u.enc(pub)}.${b64u.enc(sig)}`;
}

/** Split "…text ~ts.pub.sig" into the text and the parsed block (or null). */
export function splitBlock(text) {
  const m = String(text).match(/^(.*?)\s*~([0-9a-z]+)\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{86})\s*$/);
  if (!m) return { text: String(text).trim(), block: null };
  try {
    return { text: m[1].trim(), block: { ts: parseInt(m[2], 36), author: bytesToHex(b64u.dec(m[3])), sig: bytesToHex(b64u.dec(m[4])) } };
  } catch {
    return { text: String(text).trim(), block: null };
  }
}

export function verifySender(record) {
  if (!record.author || !record.sig) return false;
  try {
    return schnorr.verify(hexToBytes(record.sig), new TextEncoder().encode(canonical(record)), hexToBytes(record.author));
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------
// Nostr
// ------------------------------------------------------------------

export function toEvent(record, gatewaySecret, now = Math.floor(Date.now() / 1000)) {
  const t = TYPES[record.type];
  const tags = [
    ["t", UPLINK_TAG],
    ["t", record.type],
    ["rid", record.id],
    ["mesh_ts", String(record.ts)],
    ["expiration", String(expiresAt(record))],
    ["alt", `Mesh uplink: ${t.label}${record.note ? ` — ${record.note}` : ""}`],
  ];
  if (record.drill) tags.push(["t", "drill"]);
  if (record.nick) tags.push(["nick", record.nick]);
  if (record.geo) {
    tags.push(["precision", record.precision || precisionOf(record.geo)]);
    prefixes(record.geo).forEach((g) => tags.push(["g", g]));
  }
  if (record.author) tags.push(["author", record.author, record.sig]);
  if (record.ref) tags.push(["ref", record.ref]);
  if (record.data) tags.push(["data", JSON.stringify(record.data)]);
  return finalizeEvent({ kind: UPLINK_KIND, created_at: now, tags, content: record.note || "" }, gatewaySecret);
}

const tag = (ev, name) => ev.tags.find((t) => t[0] === name);

/** Parse and check an uplink event. Returns null if it isn't one or the gateway signature is bad. */
export function fromEvent(ev) {
  if (ev.kind !== UPLINK_KIND) return null;
  // Verify a clean copy: nostr-tools caches results on the object, and a copied
  // object can carry a stale "verified" flag.
  const { id, pubkey, created_at, kind, tags, content, sig } = ev;
  if (!verifyEvent({ id, pubkey, created_at, kind, tags, content, sig })) return null;
  const types = ev.tags.filter((t) => t[0] === "t").map((t) => t[1]);
  const type = types.find((x) => TYPES[x]);
  if (!type || !types.includes(UPLINK_TAG)) return null;
  const geos = ev.tags.filter((t) => t[0] === "g").map((t) => t[1]).sort((a, b) => b.length - a.length);
  const author = tag(ev, "author");
  let data = null;
  try {
    data = tag(ev, "data") ? JSON.parse(tag(ev, "data")[1]) : null;
  } catch {
    data = null;
  }
  const r = {
    v: 1,
    type,
    geo: geos[0] || "",
    precision: tag(ev, "precision")?.[1] || null,
    note: ev.content,
    ts: Number(tag(ev, "mesh_ts")?.[1] || ev.created_at),
    nick: tag(ev, "nick")?.[1] || "",
    drill: types.includes("drill"),
  };
  if (author) Object.assign(r, { author: author[1], sig: author[2] });
  if (tag(ev, "ref")) r.ref = tag(ev, "ref")[1];
  if (data) r.data = data;
  r.id = tag(ev, "rid")?.[1] || recordId(r);
  r.gateway = ev.pubkey;
  r.senderVerified = r.author ? verifySender(r) : false;
  return r;
}

/** Relay filter for viewers. Optionally limited to an area by geohash prefix. */
export function uplinkFilter({ area, since } = {}) {
  const f = { kinds: [UPLINK_KIND], "#t": [UPLINK_TAG], limit: 500 };
  if (area) f["#g"] = [area];
  if (since) f.since = since;
  return f;
}

export const gatewayPubkey = (secret) => getPublicKey(typeof secret === "string" ? hexToBytes(secret) : secret);

