// Talking to Nostr relays: publish uplink events, send exact locations to
// trusted contacts as encrypted DMs, and stream uplinks for the map.

import { nip17, nip19, getPublicKey } from "nostr-tools";
import { SimplePool, useWebSocketImplementation } from "nostr-tools/pool";

/** Node hosts pass the "ws" package here (see bin/meshhost.js). Browsers need nothing. */
export const setWebSocket = (impl) => useWebSocketImplementation(impl);
import { hexToBytes } from "./records.js";
import { toEvent, fromEvent, uplinkFilter } from "./crypto.js";
import { decode } from "./geohash.js";

/** Public relays used when none are given. Anyone can run their own instead. */
export const DEFAULT_RELAYS = ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.primal.net"];

let pool = null;
const getPool = () => (pool ||= new SimplePool());

export function closePool() {
  pool?.destroy?.();
  pool = null;
}

const asBytes = (sk) => (typeof sk === "string" ? hexToBytes(sk) : sk);

export { parsePubkey, npub } from "./nostr-keys.js";
export const nsec = (sk) => nip19.nsecEncode(asBytes(sk));

/** Publish one event to every relay. Resolves to { ok: [urls], failed: [{url, reason}] }. */
export async function publishEvent(event, relays = DEFAULT_RELAYS, { maxWait = 8000 } = {}) {
  const results = await Promise.allSettled(getPool().publish(relays, event, { maxWait }));
  const ok = [], failed = [];
  results.forEach((r, i) => (r.status === "fulfilled" ? ok.push(relays[i]) : failed.push({ url: relays[i], reason: String(r.reason) })));
  return { ok, failed };
}

/** Human-readable private message with the exact location. */
export function exactLocationText(record, exactGeo) {
  const p = decode(exactGeo);
  const lat = p.lat.toFixed(5), lon = p.lon.toFixed(5);
  return [
    `${record.type === "sos" ? "🆘 SOS" : record.type.toUpperCase()} from ${record.nick || "a mesh user"} (via bitchat mesh)`,
    record.note ? `"${record.note}"` : null,
    `Exact location: ${lat}, ${lon} (geohash ${exactGeo})`,
    `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`,
    `Sent ${new Date(record.ts * 1000).toISOString()}. This is not a call to emergency services.`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** NIP-17 gift-wrapped DMs (readable in most Nostr apps), one per contact. */
export function contactMessages(record, exactGeo, contacts, gatewaySecret) {
  const text = exactLocationText(record, exactGeo);
  return contacts.map((publicKey) => nip17.wrapEvent(asBytes(gatewaySecret), { publicKey }, text));
}

/**
 * Publish a queue item: the public event plus private exact-location DMs.
 * Returns { ok, failed, event }.
 */
export async function publishItem(item, gatewaySecret, relays = DEFAULT_RELAYS) {
  const event = toEvent(item.record, asBytes(gatewaySecret));
  const res = await publishEvent(event, relays);
  if (res.ok.length && item.exactGeo && item.contacts?.length) {
    for (const dm of contactMessages(item.record, item.exactGeo, item.contacts, gatewaySecret)) {
      await publishEvent(dm, relays).catch(() => null);
    }
  }
  return { ...res, event };
}

/** Stream uplink records. Returns a function that stops the subscription. */
export function subscribeUplinks({ relays = DEFAULT_RELAYS, area, since, onRecord, onEose }) {
  const sub = getPool().subscribe(relays, uplinkFilter({ area, since }), {
    onevent(ev) {
      const r = fromEvent(ev);
      if (r) onRecord(r, ev);
    },
    oneose() {
      onEose?.();
    },
  });
  return () => sub.close();
}

export const publicKeyOf = (sk) => getPublicKey(asBytes(sk));
