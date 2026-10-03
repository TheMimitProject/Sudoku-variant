import { useEffect, useMemo, useRef, useState } from "react";
import { generateSecretKey, getPublicKey } from "nostr-tools";
import checkin from "../tools/checkin.js";
import { createGateway } from "../uplink/gateway.js";
import { TYPES, REPORT_TYPES, aggregate, makeRecord, bytesToHex, hexToBytes } from "../uplink/records.js";
import { toEvent, fromEvent, signBlock, splitBlock } from "../uplink/crypto.js";
import { encode, coarsen, parseLocation, PRECISION } from "../uplink/geohash.js";
import { shortId } from "../uplink/records.js";
import { DEFAULT_RELAYS, subscribeUplinks, publishEvent, npub } from "../uplink/nostr.js";
import { dailyPuzzle, verifyDaily } from "../games/daily.js";
import { useMeshSession } from "./useMeshSession.js";
import { ChatLog, CommandInput, nickColor } from "./components.jsx";
import UplinkMap from "./UplinkMap.jsx";

const nowS = () => Math.floor(Date.now() / 1000);
const SIM_CENTER = "dr5ruzb8";

// ------------------------------------------------------------------
// Shared bits
// ------------------------------------------------------------------

function ItemList({ items, empty }) {
  if (!items.length) return <div className="text-xs text-teal-700 p-3">{empty}</div>;
  return (
    <div className="divide-y divide-teal-900/30">
      {items.map((it) => {
        const r = it.record;
        const t = TYPES[r.type];
        return (
          <div key={r.id} className={`px-3 py-2 text-xs ${it.expired || it.resolved ? "opacity-40" : ""}`}>
            <div className="flex items-center gap-2">
              <span>{t.icon}</span>
              <span className="font-bold" style={{ color: t.color }}>{t.label}</span>
              <span style={{ color: nickColor(r.nick) }}>{r.nick}</span>
              {r.drill && <span className="text-[10px] text-amber-300 border border-amber-500/40 rounded px-1">drill</span>}
              {r.author && <span title="signed by the sender's own key" className="text-lime-300">✓</span>}
              <span className="ml-auto text-teal-700">{Math.max(0, Math.round(it.age / 60))}m</span>
            </div>
            {r.note && <div className="text-teal-300/80 mt-0.5">{r.note}</div>}
            <div className="text-[10px] text-teal-700 mt-0.5">
              {r.geo ? `@${r.geo} (${r.precision || "area"})` : "no location"} · {it.gateways || 1} gw
              {it.confirms ? ` · ✔${it.confirms}` : ""}
              {it.resolved ? " · resolved" : it.expired ? " · expired" : ""} · {shortId(r.id)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Toggle({ on, onChange, children }) {
  return (
    <label className="flex items-center gap-2 text-xs text-teal-400 cursor-pointer select-none">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="accent-teal-400" />
      {children}
    </label>
  );
}

// ------------------------------------------------------------------
// Simulator: a mesh with bots, a gateway you can take offline, a fake relay
// ------------------------------------------------------------------

const SIM_CHIPS = [
  `/up sos @${SIM_CENTER} !exact twisted ankle by the fountain`,
  "/up safe at the north gate",
  `/up report water @${SIM_CENTER} fountain still running`,
  "/up confirm ",
  "/up resolved ",
  "/reports",
  "/roster",
  "/up status",
];

function SimTab() {
  const options = useMemo(() => ({ center: SIM_CENTER }), []);
  const { session, log, send, reset, paused, togglePause } = useMeshSession(checkin, options, { bots: 5, botDelay: [3000, 7000] });
  const [online, setOnline] = useState(false);
  const [items, setItems] = useState([]);
  const [queueView, setQueueView] = useState([]);
  const [gwLog, setGwLog] = useState([]);
  const [draft, setDraft] = useState(null);
  const relay = useRef([]);
  const gw = useRef(null);
  const onlineRef = useRef(online);
  onlineRef.current = online;

  // New gateway + empty relay for each new session.
  useEffect(() => {
    if (!session) return;
    relay.current = [];
    const key = generateSecretKey();
    gw.current = createGateway({
      label: "simulated",
      log: (l) => setGwLog((p) => [...p.slice(-30), l]),
      publish: async (item) => {
        await new Promise((r) => setTimeout(r, 250)); // pretend the network takes a moment
        relay.current.push(toEvent(item.record, key));
        return { ok: ["simulated relay"], failed: [] };
      },
    });
    gw.current.setOnline(onlineRef.current);
    session.uplinkInfo = () => gw.current.status();
    setItems([]);
    setQueueView([]);
    setGwLog([]);
  }, [session]);

  useEffect(() => {
    const iv = setInterval(async () => {
      if (!session || !gw.current) return;
      gw.current.accept(session.drainUplinks());
      if (onlineRef.current) await gw.current.flush();
      setQueueView(gw.current.queue.items.map((it) => ({ id: it.record.id, type: it.record.type, nick: it.record.nick, status: it.status })));
      setItems(aggregate(relay.current.map(fromEvent).filter(Boolean)));
    }, 600);
    return () => clearInterval(iv);
  }, [session]);

  const toggleOnline = () => {
    const v = !online;
    setOnline(v);
    gw.current?.setOnline(v);
  };

  const pending = queueView.filter((q) => q.status === "pending").length;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="flex flex-col gap-3 min-w-0">
        <div className="panel p-3 flex flex-wrap items-center gap-3">
          <button onClick={toggleOnline} className={online ? "btn-primary" : "btn-ghost border-amber-500/50 text-amber-300"}>
            {online ? "📶 gateway has signal" : "📵 gateway has no signal"}
          </button>
          <span className="text-xs text-teal-400">
            {pending} waiting on the gateway · {items.length} on the web map
          </span>
          <div className="ml-auto flex gap-2">
            <button className="chip-off" onClick={togglePause}>{paused ? "resume people" : "pause people"}</button>
            <button className="chip-off" onClick={reset}>restart</button>
          </div>
        </div>
        <p className="text-xs text-teal-500 leading-relaxed">
          Five simulated people check in and report what they see. Uploads wait on the gateway while it has no signal — switch it on and
          watch them reach the map. This simulation uses a pretend relay; nothing is published.
        </p>
        <UplinkMap items={items} fitKey={session?.key} height={430} />
        <div className="panel max-h-64 overflow-y-auto">
          <ItemList items={items} empty="Nothing on the web map yet." />
        </div>
      </div>

      <div className="flex flex-col gap-3 min-w-0">
        <div className="panel p-3">
          <div className="label mb-2">gateway queue (store and forward)</div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {queueView.length === 0 && <span className="text-xs text-teal-700">empty</span>}
            {queueView.map((q) => (
              <span key={q.id} title={`${q.nick} · ${q.status}`} className={`text-xs px-1.5 py-0.5 rounded border ${q.status === "sent" ? "border-teal-800/50 text-teal-600" : "border-amber-500/50 text-amber-200"}`}>
                {TYPES[q.type]?.icon} {q.status === "sent" ? "✓" : "…"}
              </span>
            ))}
          </div>
          <div className="text-[11px] text-teal-600 max-h-20 overflow-y-auto leading-relaxed">
            {gwLog.slice(-4).map((l, k) => (
              <div key={k}>{l}</div>
            ))}
          </div>
        </div>
        <div className="panel flex flex-col h-[520px] min-h-0">
          <div className="px-3 py-2 border-b border-teal-900/40 label">#checkin · simulated mesh</div>
          <ChatLog log={log} className="flex-1 min-h-0" />
          <div className="flex flex-wrap gap-1.5 px-2 pt-2">
            {SIM_CHIPS.map((c) => (
              <button key={c} className="chip-off" onClick={() => setDraft(c)}>{c.length > 34 ? c.slice(0, 32) + "…" : c}</button>
            ))}
          </div>
          <CommandInput onSend={send} draft={draft} onDraftUsed={() => setDraft(null)} placeholder="/up sos @geohash what happened" />
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Live map from real Nostr relays
// ------------------------------------------------------------------

function DailyBoard({ records }) {
  const cache = useRef({});
  const rows = records
    .filter((r) => r.type === "daily" && r.data?.date && r.data?.proof)
    .map((r) => {
      const d = r.data.date;
      cache.current[d] ||= dailyPuzzle(d).solution;
      return { ...r, valid: verifyDaily(cache.current[d], d, r.nick, r.data.proof) };
    })
    .sort((a, b) => (b.data.date > a.data.date ? 1 : b.data.date < a.data.date ? -1 : a.data.timeMs + a.data.mistakes * 30000 - (b.data.timeMs + b.data.mistakes * 30000)));
  if (!rows.length) return <div className="text-xs text-teal-700">No daily times uploaded yet.</div>;
  return (
    <div className="text-xs">
      {rows.slice(0, 30).map((r) => (
        <div key={r.id} className="flex gap-2 py-0.5">
          <span className="text-teal-600 w-20">{r.data.date}</span>
          <span className="flex-1" style={{ color: nickColor(r.nick) }}>{r.nick}</span>
          <span className="tabular-nums">{Math.round(r.data.timeMs / 1000)}s</span>
          <span className="text-teal-600">+{r.data.mistakes}✗</span>
          <span title={r.valid ? "proof matches the puzzle for that date" : "proof does not match"}>{r.valid ? "✓" : "✗"}</span>
        </div>
      ))}
    </div>
  );
}

function LiveTab() {
  const [relays, setRelays] = useState(DEFAULT_RELAYS.join(", "));
  const [area, setArea] = useState("");
  const [connected, setConnected] = useState(false);
  const [eose, setEose] = useState(false);
  const [records, setRecords] = useState([]);
  const [showDrills, setShowDrills] = useState(false);
  const [showOld, setShowOld] = useState(false);
  const [search, setSearch] = useState("");
  const stopRef = useRef(null);

  const connect = () => {
    stopRef.current?.();
    setRecords([]);
    setEose(false);
    const list = relays.split(/[\s,]+/).filter((r) => /^wss?:\/\//.test(r));
    const seen = new Set();
    stopRef.current = subscribeUplinks({
      relays: list,
      area: area.trim().toLowerCase() || undefined,
      since: nowS() - 48 * 3600,
      onRecord: (r, ev) => {
        if (seen.has(ev.id)) return;
        seen.add(ev.id);
        setRecords((p) => [...p, r]);
      },
      onEose: () => setEose(true),
    });
    setConnected(true);
  };
  const disconnect = () => {
    stopRef.current?.();
    stopRef.current = null;
    setConnected(false);
  };
  useEffect(() => () => stopRef.current?.(), []);

  const useHere = () =>
    navigator.geolocation?.getCurrentPosition(
      (p) => setArea(encode(p.coords.latitude, p.coords.longitude, 4)),
      () => alert("Couldn't get your location — type a geohash prefix instead.")
    );

  const items = aggregate(records).filter((it) => (showDrills || !it.record.drill) && (showOld || (!it.expired && !it.resolved)) && !["daily", "hunt"].includes(it.record.type));
  const people = search.trim()
    ? items.filter((it) => ["safe", "sos", "enroute"].includes(it.record.type) && it.record.nick.toLowerCase().includes(search.trim().toLowerCase()))
    : [];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex flex-col gap-3 min-w-0">
        <div className="panel p-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 flex-1 min-w-[220px]">
            <span className="label">relays</span>
            <input value={relays} onChange={(e) => setRelays(e.target.value)} className="bg-ink-950 border border-teal-900/50 rounded px-2 py-1.5 text-xs text-teal-100" />
          </label>
          <label className="flex flex-col gap-1 w-36">
            <span className="label">area (geohash)</span>
            <div className="flex gap-1">
              <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="all" className="w-full bg-ink-950 border border-teal-900/50 rounded px-2 py-1.5 text-xs text-teal-100" />
              <button className="chip-off" title="use my location (city-sized area)" onClick={useHere}>◎</button>
            </div>
          </label>
          {connected ? (
            <button className="btn-ghost" onClick={disconnect}>disconnect</button>
          ) : (
            <button className="btn-primary" onClick={connect}>connect</button>
          )}
          <div className="flex gap-4 w-full">
            <Toggle on={showDrills} onChange={setShowDrills}>show drills</Toggle>
            <Toggle on={showOld} onChange={setShowOld}>show expired / resolved</Toggle>
            <span className="text-xs text-teal-600 ml-auto">
              {connected ? (eose ? `${records.length} uplinks in the last 48 h` : "waiting for relays…") : "not connected"}
            </span>
          </div>
        </div>
        <UplinkMap items={items} fitKey={connected ? `${relays}|${area}|${eose}` : "off"} height={460} />
        <p className="text-[11px] text-teal-700 leading-relaxed">
          Anything shown here was posted by people on a bitchat mesh through a gateway. Locations are only as precise as the sender chose; a box shows
          the whole area. This is not an emergency service — if someone is in danger and you can reach emergency services, call them.
        </p>
      </div>
      <div className="flex flex-col gap-3 min-w-0">
        <div className="panel p-3">
          <div className="label mb-2">find a person</div>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="nick" className="w-full bg-ink-950 border border-teal-900/50 rounded px-2 py-1.5 text-xs text-teal-100" />
          {search.trim() && <ItemList items={people} empty="No check-ins under that name in the last 48 hours." />}
        </div>
        <div className="panel max-h-[420px] overflow-y-auto">
          <div className="label px-3 pt-3">sos first, newest first</div>
          <ItemList items={items} empty={connected ? "Nothing reported in this area." : "Connect to see uplinks."} />
        </div>
        <div className="panel p-3">
          <div className="label mb-2">daily puzzle — global times</div>
          <DailyBoard records={records} />
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Composer: sign a message on your phone, paste it into bitchat
// ------------------------------------------------------------------

function loadKey() {
  try {
    const h = localStorage.getItem("meshup.sk");
    if (h && /^[0-9a-f]{64}$/.test(h)) return hexToBytes(h);
  } catch {}
  const sk = generateSecretKey();
  try {
    localStorage.setItem("meshup.sk", bytesToHex(sk));
  } catch {}
  return sk;
}

function SendTab() {
  const [sk, setSk] = useState(loadKey);
  const [type, setType] = useState("sos");
  const [loc, setLoc] = useState("");
  const [precision, setPrecision] = useState("area");
  const [note, setNote] = useState("");
  const [drill, setDrill] = useState(true);
  const [ts, setTs] = useState(nowS());
  const [copied, setCopied] = useState(false);
  const [ack, setAck] = useState(false);
  const [result, setResult] = useState(null);
  const [locErr, setLocErr] = useState("");

  const pub = getPublicKey(sk);
  const fullGeo = parseLocation(loc) || "";
  const geo = fullGeo ? coarsen(fullGeo, precision) : "";
  const cleanNote = note.trim().replace(/\s+/g, " ").slice(0, 140);
  useEffect(() => setTs(nowS()), [type, geo, cleanNote, drill]);

  const block = signBlock({ type, geo, note: cleanNote, ts }, sk);
  const verb = REPORT_TYPES.includes(type) ? `report ${type}` : type;
  const command = ["/up", verb, geo ? `@${geo}` : "@-", drill ? "!drill" : "", cleanNote, block].filter(Boolean).join(" ");
  const bytes = new TextEncoder().encode(command).length;

  const locate = () => {
    setLocErr("");
    if (!navigator.geolocation) return setLocErr("this browser can't share location");
    navigator.geolocation.getCurrentPosition(
      (p) => setLoc(encode(p.coords.latitude, p.coords.longitude, 8)),
      (e) => setLocErr(e.message || "location unavailable"),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const publishNow = async () => {
    setResult("publishing…");
    const { author, sig } = splitBlock(`x ${block}`).block;
    const signed = makeRecord({ type, geo, note: cleanNote, ts, drill, author, sig });
    try {
      const res = await publishEvent(toEvent(signed, sk), DEFAULT_RELAYS);
      setResult(res.ok.length ? `✓ published to ${res.ok.length} relay${res.ok.length > 1 ? "s" : ""}` : "✗ no relay reachable — paste the message into bitchat instead");
    } catch (e) {
      setResult(`✗ ${e.message || e}`);
    }
  };

  const needsAck = type === "sos" && !drill;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <div className="panel p-5 flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-black text-teal-100">Send from your phone</h2>
          <p className="text-xs text-teal-500 leading-relaxed mt-1">
            Builds a short message signed with a key that stays on this device. Paste it into bitchat; any gateway on the mesh will upload it, and the
            map shows it as signed by you. Works offline once this page is loaded.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {["sos", "safe", "enroute", ...REPORT_TYPES].map((t) => (
            <button key={t} className={t === type ? "chip-on" : "chip-off"} onClick={() => setType(t)}>
              {TYPES[t].icon} {TYPES[t].label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="label">location</span>
          <div className="flex gap-2">
            <input value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="geohash or lat,lon — or leave empty" className="flex-1 min-w-0 bg-ink-950 border border-teal-900/50 rounded px-2 py-2 text-xs text-teal-100" />
            <button className="btn-ghost" onClick={locate}>◎ use my location</button>
          </div>
          {locErr && <span className="text-xs text-red-300">{locErr}</span>}
          {fullGeo && (
            <div className="flex flex-wrap gap-1.5 items-center">
              {Object.entries(PRECISION).map(([k, p]) => (
                <button key={k} className={k === precision ? "chip-on" : "chip-off"} onClick={() => setPrecision(k)}>
                  {p.label} {p.radius}
                </button>
              ))}
              <span className="text-[11px] text-teal-600">shared publicly as @{geo}</span>
            </div>
          )}
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="label">what's happening</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={140} placeholder={type === "sos" ? "twisted ankle, can't walk" : "short note"} className="bg-ink-950 border border-teal-900/50 rounded px-2 py-2 text-xs text-teal-100" />
        </label>

        <Toggle on={drill} onChange={setDrill}>this is a drill (hidden on the public map unless viewers ask to see drills)</Toggle>
      </div>

      <div className="flex flex-col gap-4">
        <div className="panel p-4">
          <div className="label mb-2">paste this into bitchat · {bytes} bytes</div>
          <pre className="whitespace-pre-wrap break-all text-[11px] leading-relaxed text-lime-200 bg-ink-950 border border-teal-900/40 rounded p-3">{command}</pre>
          <div className="flex gap-2 mt-3">
            <button className="btn-primary" onClick={copy}>{copied ? "copied ✓" : "copy"}</button>
            <button className="btn-ghost" onClick={() => setTs(nowS())}>re-sign now</button>
          </div>
        </div>

        <div className="panel p-4 text-xs text-teal-400 leading-relaxed">
          <div className="label mb-2">or, if this phone has signal</div>
          <p>Publish straight to the web map without a gateway.</p>
          {needsAck && (
            <div className="mt-2">
              <Toggle on={ack} onChange={setAck}>I understand this is not a call to emergency services</Toggle>
            </div>
          )}
          <button className="btn-ghost mt-3" disabled={needsAck && !ack} onClick={publishNow}>publish directly</button>
          {result && <div className="mt-2 text-teal-200">{result}</div>}
        </div>

        <div className="panel p-4 text-xs text-teal-500 leading-relaxed">
          <div className="label mb-2">your key</div>
          <div className="break-all text-teal-300">{npub(pub)}</div>
          <p className="mt-2">
            Messages you sign here show on the map as coming from this key. To have your exact location sent privately to someone, run{" "}
            <code className="text-amber-200">/up contact &lt;their npub&gt;</code> on the mesh. The secret part of your key never leaves this browser.
          </p>
          <button
            className="chip-off mt-2"
            onClick={() => {
              if (!confirm("Make a new key? Messages signed with the old one will no longer match this device.")) return;
              const k = generateSecretKey();
              try {
                localStorage.setItem("meshup.sk", bytesToHex(k));
              } catch {}
              setSk(k);
            }}
          >
            new key
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------

const TABS = [
  ["sim", "Simulator"],
  ["live", "Live map"],
  ["send", "Send from your phone"],
];

export default function UplinkPage() {
  const [tab, setTab] = useState("sim");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="max-w-2xl">
          <h2 className="text-xl font-black text-teal-100">Uplink — from the mesh to the web</h2>
          <p className="text-xs text-teal-500 leading-relaxed mt-1">
            Anyone with signal can act as a gateway. Messages marked <code className="text-amber-200">/up</code> wait on the mesh until a gateway reaches the
            internet, then appear on a public map: SOS calls, "I'm safe" check-ins, resources and hazards. Nothing leaves the mesh without /up.
          </p>
        </div>
        <div className="flex gap-1.5 sm:ml-auto">
          {TABS.map(([k, label]) => (
            <button key={k} className={tab === k ? "chip-on" : "chip-off"} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {tab === "sim" ? <SimTab /> : tab === "live" ? <LiveTab /> : <SendTab />}
    </div>
  );
}
