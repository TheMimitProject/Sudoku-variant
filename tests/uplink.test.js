import { describe, it, expect } from "vitest";
import { generateSecretKey, getPublicKey, nip17 } from "nostr-tools";
import { encode, decode, coarsen, parseLocation, prefixes, distance } from "../src/uplink/geohash.js";
import { makeRecord, aggregate, recordId, UPLINK_KIND } from "../src/uplink/records.js";
import { signBlock, splitBlock, verifySender, toEvent, fromEvent } from "../src/uplink/crypto.js";
import { parseUpArgs, recordFromArgs } from "../src/uplink/mesh.js";
import { UplinkQueue } from "../src/uplink/queue.js";
import { contactMessages, parsePubkey, npub } from "../src/uplink/nostr.js";
import { createSession } from "../src/engine/meshgame.js";
import checkin from "../src/tools/checkin.js";
import pingtest from "../src/tools/pingtest.js";

const NOW = 1759500000; // seconds

describe("geohash", () => {
  it("matches the reference encoding and round-trips", () => {
    expect(encode(57.64911, 10.40744, 11)).toBe("u4pruydqqvj");
    const p = decode("u4pruydqqvj");
    expect(p.lat).toBeCloseTo(57.64911, 4);
    expect(p.lon).toBeCloseTo(10.40744, 4);
  });
  it("coarsens for privacy and never adds precision", () => {
    expect(coarsen("dr5regw3", "area")).toBe("dr5reg");
    expect(coarsen("dr5regw3", "city")).toBe("dr5r");
    expect(coarsen("dr5r", "exact")).toBe("dr5r");
    expect(prefixes("dr5reg")).toEqual(["dr5", "dr5r", "dr5re", "dr5reg"]);
  });
  it("parses lat,lon and geohashes", () => {
    expect(parseLocation("40.7128,-74.0060")).toBe(encode(40.7128, -74.006, 8));
    expect(parseLocation("dr5regw3")).toBe("dr5regw3");
    expect(parseLocation("hello")).toBeNull();
    const a = decode("dr5regw3"), b = decode("dr5regw2");
    expect(distance(a, b)).toBeLessThan(60);
  });
});

describe("mesh parsing", () => {
  it("reads location, flags and note", () => {
    expect(parseUpArgs("40.7128, -74.0060 !exact twisted ankle".split(" "))).toMatchObject({ geo: encode(40.7128, -74.006, 8), precision: "exact", note: "twisted ankle" });
    expect(parseUpArgs("@gcpvj !drill tap works".split(" "))).toMatchObject({ geo: "gcpvj", drill: true, note: "tap works" });
    // Words that happen to be valid geohash characters aren't locations.
    expect(parseUpArgs("tree down".split(" "))).toMatchObject({ geo: "", note: "tree down" });
    expect(parseUpArgs("2nd floor stairwell".split(" "))).toMatchObject({ geo: "", note: "2nd floor stairwell" });
    expect(parseUpArgs("@- 2nd floor".split(" "))).toMatchObject({ geo: "", note: "2nd floor" });
  });
});

describe("sender signatures", () => {
  const sk = generateSecretKey();
  const fields = { type: "sos", geo: "dr5reg", note: "twisted ankle", ts: NOW };

  it("verifies a signed composer message end to end", () => {
    const msg = `@dr5reg twisted ankle ${signBlock(fields, sk)}`;
    expect(msg.length).toBeLessThan(170);
    const { record, error } = recordFromArgs("sos", parseUpArgs(msg.split(" ")), { nick: "ann", now: Date.now() });
    expect(error).toBeUndefined();
    expect(record.ts).toBe(NOW);
    expect(record.author).toBe(getPublicKey(sk));
    expect(verifySender(record)).toBe(true);
  });

  it("rejects an edited message", () => {
    const msg = `@dr5reg twisted ankle badly ${signBlock(fields, sk)}`;
    expect(recordFromArgs("sos", parseUpArgs(msg.split(" ")), { nick: "ann", now: Date.now() }).error).toMatch(/signature/);
    expect(splitBlock("no block here").block).toBeNull();
  });
});

describe("nostr events", () => {
  const gw1 = generateSecretKey(), gw2 = generateSecretKey();

  it("round-trips through an event, coarsened, with geohash prefix tags and expiry", () => {
    const r = makeRecord({ type: "sos", geo: "dr5regw3", precision: "area", note: "help", ts: NOW, nick: "ann" });
    expect(r.geo).toBe("dr5reg");
    const ev = toEvent(r, gw1, NOW + 5);
    expect(ev.kind).toBe(UPLINK_KIND);
    expect(JSON.stringify(ev)).not.toContain("dr5regw3"); // exact location never published
    expect(ev.tags).toContainEqual(["g", "dr5re"]);
    expect(ev.tags).toContainEqual(["expiration", String(NOW + 6 * 3600)]);
    const back = fromEvent(ev);
    expect(back).toMatchObject({ type: "sos", geo: "dr5reg", note: "help", nick: "ann", id: r.id, gateway: getPublicKey(gw1) });
  });

  it("rejects tampered events", () => {
    const ev = toEvent(makeRecord({ type: "safe", ts: NOW, nick: "bob" }), gw1, NOW);
    expect(fromEvent({ ...ev, content: "changed" })).toBeNull();
  });

  it("aggregates duplicates, confirmations, resolutions and expiry", () => {
    const sos = makeRecord({ type: "sos", geo: "dr5regw3", note: "ankle", ts: NOW, nick: "ann" });
    const water1 = makeRecord({ type: "water", geo: "dr5regw3", note: "tap", ts: NOW, nick: "bob" });
    const water2 = makeRecord({ type: "water", geo: "dr5regqq", note: "fountain", ts: NOW, nick: "cy" });
    const old = makeRecord({ type: "fire", geo: "dr5r", ts: NOW - 7 * 3600, nick: "dee" });
    const confirm = makeRecord({ type: "confirm", ref: water1.id, ts: NOW, nick: "eve" });
    const fakeResolve = makeRecord({ type: "resolved", ref: sos.id, ts: NOW, nick: "mallory" });
    const events = [sos, water1, water2, old, confirm, fakeResolve].map((r) => toEvent(r, gw1, NOW));
    events.push(toEvent(sos, gw2, NOW)); // second gateway relays the same SOS
    let items = aggregate(events.map(fromEvent), NOW + 60);
    const get = (r) => items.find((i) => i.record.id === r.id);
    expect(get(sos).gateways).toBe(2);
    expect(get(sos).resolved).toBe(false); // only the sender can resolve
    expect(get(water1).confirms).toBe(2); // eve + cy's independent report nearby
    expect(get(old).expired).toBe(true);
    expect(items[0].record.type).toBe("sos");
    const realResolve = makeRecord({ type: "resolved", ref: sos.id, ts: NOW, nick: "ann" });
    items = aggregate([...events, toEvent(realResolve, gw1, NOW)].map(fromEvent), NOW + 60);
    expect(get(sos).resolved).toBe(true);
  });

  it("dedupes unsigned copies seen by different gateways a few minutes apart", () => {
    const a = makeRecord({ type: "safe", note: "ok", ts: NOW + 10, nick: "ann" });
    const b = makeRecord({ type: "safe", note: "ok", ts: NOW + 200, nick: "ann" });
    expect(recordId(a)).toBe(recordId(b));
  });

  it("sends exact location to contacts as NIP-17 DMs they can decrypt", () => {
    const contact = generateSecretKey();
    const r = makeRecord({ type: "sos", geo: "dr5regw3", note: "ankle", ts: NOW, nick: "ann" });
    const [dm] = contactMessages(r, "dr5regw3", [getPublicKey(contact)], gw1);
    expect(dm.kind).toBe(1059);
    expect(JSON.stringify(dm)).not.toContain("dr5regw3");
    const rumor = nip17.unwrapEvent(dm, contact);
    expect(rumor.content).toContain("dr5regw3");
    expect(rumor.content).toContain("openstreetmap.org");
    expect(parsePubkey(npub(getPublicKey(contact)))).toBe(getPublicKey(contact));
  });
});

describe("store-and-forward queue", () => {
  it("dedupes, survives serialisation, and drops expired records", () => {
    const q = new UplinkQueue();
    const r = makeRecord({ type: "sos", geo: "dr5regw3", ts: NOW, nick: "ann" });
    expect(q.add(r, {}, NOW)).toBe(true);
    expect(q.add(r, {}, NOW)).toBe(false);
    const q2 = UplinkQueue.fromJSON(JSON.stringify(q));
    expect(q2.pending(NOW).length).toBe(1);
    q2.markSent(r.id, ["wss://x"]);
    expect(q2.stats(NOW)).toEqual({ pending: 0, sent: 1, total: 1 });
    expect(q2.prune(NOW + 7 * 3600)).toBe(1);
  });
});

describe("mesh commands", () => {
  it("plain commands stay on the mesh; /up queues records with the private exact location", () => {
    const s = createSession(checkin, { now: NOW * 1000 });
    s.receive("ann", "/sos stuck on the ridge", NOW * 1000);
    expect(s.drainUplinks()).toHaveLength(0);
    const contact = getPublicKey(generateSecretKey());
    s.receive("ann", `/up contact ${npub(contact)}`, NOW * 1000);
    s.receive("ann", "/up sos 40.7128,-74.0060 stuck on the ridge", NOW * 1000);
    const [up] = s.drainUplinks();
    expect(up.record.geo).toHaveLength(6); // public: neighbourhood by default
    expect(up.exactGeo).toHaveLength(8); // private: only for contacts
    expect(up.contacts).toEqual([contact]);
  });

  it("reports, confirmations and resolutions", () => {
    const s = createSession(checkin, { now: NOW * 1000 });
    const out = s.receive("bob", "/up report water @dr5regw3 tap works", NOW * 1000);
    const id = out.find((o) => o.text.includes("reports water")).text.match(/id (\w+)/)[1];
    expect(s.receive("bob", `/up confirm ${id}`, NOW * 1000).map((o) => o.text)).toContain("you can't confirm your own report");
    s.receive("cy", `/up confirm ${id}`, NOW * 1000);
    s.receive("bob", `/up resolved ${id}`, NOW * 1000);
    const types = s.drainUplinks().map((u) => u.record.type);
    expect(types).toEqual(["water", "confirm", "resolved"]);
  });

  it("ping test uploads coverage for nodes that shared a location", () => {
    const s = createSession(pingtest, { now: 0, options: { intervalMs: 1000 } });
    s.receive("host", "/probe start 4", 0);
    s.tick(5000);
    s.receive("ann", "/pong 1-3 @dr5regw3", 6000);
    s.receive("bob", "/pong 1-4", 6000);
    s.receive("host", "/up probe", 7000);
    const ups = s.drainUplinks();
    expect(ups).toHaveLength(1);
    expect(ups[0].record).toMatchObject({ type: "coverage", nick: "ann", geo: "dr5reg" });
    expect(ups[0].record.data.received).toBe(75);
  });
});

describe("end to end over a real relay connection", () => {
  it("gateway publishes, the map subscription reads it, the contact decrypts the exact location", async () => {
    const { startRelay } = await import("../scripts/local-relay.mjs");
    const WS = (await import("ws")).default;
    const { setWebSocket, publishItem, subscribeUplinks, closePool } = await import("../src/uplink/nostr.js");
    const { createGateway } = await import("../src/uplink/gateway.js");
    setWebSocket(WS);
    const port = 17000 + Math.floor(Math.random() * 2000);
    const relay = startRelay({ port, log: () => {} });
    const url = `ws://localhost:${port}`;
    try {
      const gwKey = generateSecretKey();
      const contact = generateSecretKey();
      const s = createSession(checkin, { now: Date.now() });
      s.receive("ann", `/up contact ${npub(getPublicKey(contact))}`);
      s.receive("ann", "/up sos 40.7128,-74.0060 stuck on the ridge");
      const gw = createGateway({ publish: (item) => publishItem(item, gwKey, [url]) });
      gw.accept(s.drainUplinks());
      const res = await gw.flush();
      expect(res.sent).toBe(1);

      const seen = await new Promise((resolve) => {
        const got = [];
        const stop = subscribeUplinks({ relays: [url], onRecord: (r) => got.push(r), onEose: () => (stop(), resolve(got)) });
      });
      expect(seen).toHaveLength(1);
      expect(seen[0]).toMatchObject({ type: "sos", nick: "ann", geo: encode(40.7128, -74.006, 6) });

      const wraps = [...relay.events.values()].filter((e) => e.kind === 1059 && e.tags.some((t) => t[0] === "p" && t[1] === getPublicKey(contact)));
      expect(wraps).toHaveLength(1);
      expect(nip17.unwrapEvent(wraps[0], contact).content).toContain(encode(40.7128, -74.006, 8));
    } finally {
      closePool();
      await relay.close();
    }
  }, 20000);
});
