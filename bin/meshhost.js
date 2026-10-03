#!/usr/bin/env node
// meshhost — run any game or tool as the host of a real bitchat channel.
//
// bitchat has no bot API, so the host is a person with this running next to
// their phone: type (or paste) the messages you see as "nick: text", and copy
// the lines meshhost prints back into bitchat. ">>>" lines go to the channel,
// "/msg nick …" lines are private messages.

import readline from "node:readline";
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createSession, renderOutput } from "../src/engine/meshgame.js";
import { CATALOG, byId, defaultOptions } from "../src/catalog.js";
import { generate } from "../src/engine/sudoku.js";
import { parsePuzzleId } from "../src/games/sudoku.js";
import { dailyPuzzle, verifyDaily } from "../src/games/daily.js";
import { parseCell, cellName } from "../src/engine/commands.js";
import { createGateway } from "../src/uplink/gateway.js";
import { UplinkQueue } from "../src/uplink/queue.js";
import { bytesToHex, hexToBytes } from "../src/uplink/records.js";
import { toEvent, gatewayPubkey } from "../src/uplink/crypto.js";

const C = process.stdout.isTTY
  ? { dim: (s) => `\x1b[2m${s}\x1b[0m`, cyan: (s) => `\x1b[36m${s}\x1b[0m`, mag: (s) => `\x1b[35m${s}\x1b[0m`, red: (s) => `\x1b[31m${s}\x1b[0m`, green: (s) => `\x1b[32m${s}\x1b[0m` }
  : { dim: (s) => s, cyan: (s) => s, mag: (s) => s, red: (s) => s, green: (s) => s };

function parseArgs(argv) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      flags[k] = v ?? (argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true);
    } else pos.push(a);
  }
  return { pos, flags };
}

const coerce = (v) => (v === "true" ? true : v === "false" ? false : /^\d+$/.test(String(v)) ? Number(v) : v);

function usage() {
  console.log(`meshhost — host bitchat mesh games from your terminal

  meshhost list                         games and tools
  meshhost <game> [options]             host a session (type "nick: message" lines)
  meshhost verify <puzzle-id> R3C5=7 …  check sudoku moves offline (no host needed)
  meshhost daily-verify <nick> <proof> [--date YYYY-MM-DD]

options
  --mode race|territory|blind|relay    sudoku mode
  --size 9|6   --difficulty easy|medium|hard   --seed N
  --hunt hunt.json                      scavenger clues [{clue, code, hint}]
  --bots N                              add N simulated players (practice)
  --script file.txt                     replay a transcript, then exit

uplink gateway (check-in, ping test, daily, scavenger)
  --gateway                             queue /up records and forward them to the web
  --relays default|wss://a,wss://b      publish to Nostr relays (without this: dry run to a file)
  --drill                               mark everything as a drill (hidden on the public map by default)
  --state-dir DIR                       where the key and queue live (default ~/.meshhost)

in a session
  ghostnode: /sudo play R3C5=7          feed a message you saw
  !board  !score  !who  !quit           host shortcuts
  !up status|flush|online|offline       gateway controls`);
}

function list() {
  let group = "";
  for (const e of CATALOG) {
    if (e.group !== group) console.log(`\n${(group = e.group)}`);
    const opts = e.options.map((o) => `--${o.key} ${o.choices.join("|")}`).join("  ");
    console.log(`  ${e.module.id.padEnd(12)} ${e.module.summary}  (${e.players})${opts ? "\n               " + C.dim(opts) : ""}`);
  }
}

function verifyMoves(id, moves) {
  const p = parsePuzzleId(id);
  if (!p) return console.log(C.red(`bad puzzle id "${id}" — expected like 9.medium.482913`));
  const { solution } = generate(p);
  for (const m of moves) {
    const cell = parseCell(m, p.size);
    if (!cell || cell.v == null) console.log(`${m}: ${C.red("can't parse")}`);
    else {
      const ok = solution[cell.r * p.size + cell.c] === cell.v;
      console.log(`${cellName(cell.r, cell.c)}=${cell.v}: ${ok ? C.green("✓ correct") : C.red("✗ wrong")}`);
    }
  }
}

function host(entry, flags) {
  const options = { ...defaultOptions(entry) };
  for (const o of entry.options) if (flags[o.key] != null) options[o.key] = coerce(flags[o.key]);
  if (flags.hunt) options.hunt = JSON.parse(readFileSync(flags.hunt, "utf8"));
  for (const k of ["nightMs", "dayMs", "cooldownMs", "teamSize", "date"]) if (flags[k] != null) options[k] = coerce(flags[k]);
  if (flags.seed != null) options.seed = coerce(flags.seed); // same seed → same puzzle on every device
  const session = createSession(entry.module, { seed: flags.seed != null ? coerce(flags.seed) : undefined, options, now: Date.now() });

  const print = (outs) =>
    outs.forEach((o) => {
      const line = renderOutput(o);
      console.log(o.to === "*" ? C.cyan(line) : C.mag(line));
    });

  console.log(C.dim(`hosting ${entry.module.name} on ${entry.module.channel} — paste lines as "nick: message". !help for shortcuts.`));
  print(session.intro);
  const gateway = flags.gateway ? setupGateway(flags) : null;
  if (gateway) session.uplinkInfo = () => gateway.status();
  const pumpUplinks = () => {
    const items = session.drainUplinks();
    if (!items.length) return;
    if (!gateway) return console.log(C.dim(`(${items.length} /up record${items.length > 1 ? "s" : ""} ignored — start with --gateway to forward them)`));
    gateway.accept(items);
    gateway.flush();
  };

  const bots = [];
  const botCount = Number(flags.bots || 0);
  const botNames = ["ghostnode", "rf_witch", "blewalker", "meshpunk", "zerohop", "staticnoise", "nostr_kid", "darkpacket"];
  for (let i = 0; i < botCount; i++) {
    bots.push(botNames[i % botNames.length]);
    print(session.join(bots[i], Date.now()));
  }

  const feed = (line) => {
    const t = line.trim();
    if (!t) return;
    if (t.startsWith("!")) {
      const cmd = t.slice(1).toLowerCase();
      if (cmd === "quit" || cmd === "exit") process.exit(0);
      if (cmd === "help") return console.log(C.dim("!board !score !who !quit !up status|flush|online|offline  ·  any line 'nick: text' is a chat message"));
      if (cmd.startsWith("up")) {
        if (!gateway) return console.log(C.red("no gateway — restart with --gateway"));
        const sub = cmd.split(/\s+/)[1] || "status";
        if (sub === "online") gateway.setOnline(true);
        if (sub === "offline") gateway.setOnline(false);
        if (sub === "flush" || sub === "online") gateway.flush();
        return console.log(C.green(gateway.status()));
      }
      const as = session.players()[0] || "host";
      const map = { board: "/sync", score: "/score", who: "/who" };
      return print(session.receive(as, map[cmd] || `/${cmd}`, Date.now()));
    }
    const m = t.match(/^<?([^:>\s]+)>?:?\s+(.*)$/);
    if (!m) return console.log(C.red('format: "nick: message"'));
    print(session.receive(m[1], m[2], Date.now()));
    pumpUplinks();
  };

  if (flags.script) {
    // Replay mode: fixed clock steps so transcripts are reproducible.
    let t = Date.now();
    for (const line of readFileSync(flags.script, "utf8").split("\n")) {
      t += 1500;
      print(session.tick(t));
      if (!line.startsWith("#")) feed(line);
    }
    print(session.tick(t + 1e9));
    pumpUplinks();
    if (gateway) gateway.flush().then(() => console.log(C.green(gateway.status())));
    return;
  }

  const tick = setInterval(() => {
    print(session.tick(Date.now()));
    if (bots.length && Math.random() < 0.35) {
      const b = bots[Math.floor(Math.random() * bots.length)];
      const mv = session.botMove(b);
      if (mv) {
        console.log(C.dim(`<${b}> ${mv}`));
        print(session.receive(b, mv, Date.now()));
        pumpUplinks();
      }
    }
    // Store-and-forward: retry anything still waiting every 30 s.
    if (gateway && gateway.online && Date.now() % 30000 < 1000) gateway.flush();
    if (session.ended) {
      clearInterval(tick);
      console.log(C.dim("game over — !quit or Ctrl-C"));
    }
  }, 1000);

  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  rl.on("line", feed);
  rl.on("close", () => {
    clearInterval(tick);
    process.exit(0);
  });
}

function setupGateway(flags) {
  const dir = flags["state-dir"] || join(homedir(), ".meshhost");
  mkdirSync(dir, { recursive: true });
  const keyFile = join(dir, "gateway.key");
  let secret;
  if (existsSync(keyFile)) secret = hexToBytes(readFileSync(keyFile, "utf8").trim());
  else {
    secret = crypto.getRandomValues(new Uint8Array(32));
    writeFileSync(keyFile, bytesToHex(secret) + "\n");
    try { chmodSync(keyFile, 0o600); } catch {}
  }
  const queueFile = join(dir, "uplink-queue.json");
  const queue = existsSync(queueFile) ? UplinkQueue.fromJSON(readFileSync(queueFile, "utf8")) : new UplinkQueue();
  const save = () => writeFileSync(queueFile, JSON.stringify(queue));
  const log = (l) => console.log(C.dim(`[uplink] ${l}`));

  let publish, label;
  if (flags.relays) {
    label = "live";
    const nostr = import("../src/uplink/nostr.js").then(async (m) => {
      // Use the "ws" package: Node's built-in WebSocket can recurse on connection
      // errors inside nostr-tools and crash the host while it's offline.
      m.setWebSocket((await import("ws")).default);
      return m;
    });
    const relays = flags.relays === true || flags.relays === "default" ? null : String(flags.relays).split(",").map((r) => r.trim()).filter(Boolean);
    publish = async (item) => {
      const m = await nostr;
      return m.publishItem(item, secret, relays || m.DEFAULT_RELAYS);
    };
    nostr.then((m) => log(`publishing to ${(relays || m.DEFAULT_RELAYS).join(", ")}`));
  } else {
    label = "dry run";
    const outbox = join(dir, "uplink-outbox.jsonl");
    publish = async (item) => {
      appendFileSync(outbox, JSON.stringify(toEvent(item.record, secret)) + "\n");
      if (item.exactGeo && item.contacts?.length) {
        const { contactMessages } = await import("../src/uplink/nostr.js");
        for (const dm of contactMessages(item.record, item.exactGeo, item.contacts, secret)) appendFileSync(outbox, JSON.stringify(dm) + "\n");
      }
      return { ok: [outbox], failed: [] };
    };
    log(`dry run — events are written to ${outbox}. Add --relays default to publish for real.`);
  }
  log(`gateway key ${gatewayPubkey(secret).slice(0, 16)}… · queue ${queueFile}`);
  const gw = createGateway({ queue, publish, save, log, drill: !!flags.drill, label });
  const s = queue.stats();
  if (s.pending) log(`${s.pending} record${s.pending > 1 ? "s" : ""} waiting from last time`);
  return gw;
}

const { pos, flags } = parseArgs(process.argv.slice(2));
const [cmd, ...rest] = pos;

if (!cmd || cmd === "help" || flags.help) usage();
else if (cmd === "list") list();
else if (cmd === "verify") verifyMoves(rest[0], rest.slice(1));
else if (cmd === "daily-verify") {
  const date = flags.date || new Date().toISOString().slice(0, 10);
  const ok = verifyDaily(dailyPuzzle(date).solution, date, rest[0], rest[1]);
  console.log(ok ? C.green(`✓ ${rest[0]}'s proof for ${date} is valid`) : C.red(`✗ proof does not match ${date}`));
} else if (byId[cmd]) host(byId[cmd], flags);
else {
  console.log(C.red(`unknown game "${cmd}"`));
  list();
  process.exitCode = 1;
}
