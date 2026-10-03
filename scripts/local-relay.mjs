#!/usr/bin/env node
// A tiny Nostr relay for local testing, drills, or a community that wants its
// own uplink map without depending on public relays.
//
//   node scripts/local-relay.mjs [--port 7447] [--store relay.jsonl]
//
// Supports EVENT / REQ / CLOSE, verifies signatures, honours NIP-40 expiration,
// and keeps events in memory (optionally appended to a JSONL file).

import { WebSocketServer } from "ws";
import { readFileSync, appendFileSync, existsSync } from "node:fs";
import { verifyEvent, matchFilter } from "nostr-tools";

export function startRelay({ port = 7447, store = null, log = console.log } = {}) {
  const events = new Map();
  const expired = (ev) => {
    const t = ev.tags.find((x) => x[0] === "expiration");
    return t && Number(t[1]) < Date.now() / 1000;
  };
  if (store && existsSync(store)) {
    for (const line of readFileSync(store, "utf8").split("\n")) {
      try {
        const ev = JSON.parse(line);
        if (verifyEvent(ev)) events.set(ev.id, ev);
      } catch {}
    }
  }

  const wss = new WebSocketServer({ port });
  const subs = new Map(); // ws -> Map(subId -> filters)

  wss.on("connection", (ws) => {
    subs.set(ws, new Map());
    ws.on("close", () => subs.delete(ws));
    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return ws.send(JSON.stringify(["NOTICE", "bad json"]));
      }
      const [type, ...rest] = msg;
      if (type === "EVENT") {
        const ev = rest[0];
        if (!ev || !verifyEvent(ev)) return ws.send(JSON.stringify(["OK", ev?.id || "", false, "invalid: bad signature"]));
        if (expired(ev)) return ws.send(JSON.stringify(["OK", ev.id, false, "invalid: expired"]));
        const fresh = !events.has(ev.id);
        events.set(ev.id, ev);
        if (fresh && store) appendFileSync(store, JSON.stringify(ev) + "\n");
        ws.send(JSON.stringify(["OK", ev.id, true, fresh ? "" : "duplicate:"]));
        for (const [client, map] of subs) {
          for (const [id, filters] of map) if (filters.some((f) => matchFilter(f, ev))) client.send(JSON.stringify(["EVENT", id, ev]));
        }
      } else if (type === "REQ") {
        const [id, ...filters] = rest;
        subs.get(ws).set(id, filters);
        const matches = [...events.values()].filter((ev) => !expired(ev) && filters.some((f) => matchFilter(f, ev))).sort((a, b) => b.created_at - a.created_at);
        const limit = Math.min(...filters.map((f) => f.limit ?? 500));
        matches.slice(0, limit).forEach((ev) => ws.send(JSON.stringify(["EVENT", id, ev])));
        ws.send(JSON.stringify(["EOSE", id]));
      } else if (type === "CLOSE") {
        subs.get(ws)?.delete(rest[0]);
      }
    });
  });
  log(`local relay on ws://localhost:${port}${store ? ` (storing in ${store})` : ""}`);
  return { wss, events, close: () => new Promise((r) => wss.close(r)) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k, d) => {
    const i = process.argv.indexOf(`--${k}`);
    return i > 0 ? process.argv[i + 1] : d;
  };
  startRelay({ port: Number(arg("port", 7447)), store: arg("store", null) });
}
