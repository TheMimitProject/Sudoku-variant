#!/usr/bin/env node
// meshhost — run any game or tool as the host of a real bitchat channel.
//
// bitchat has no bot API, so the host is a person with this running next to
// their phone: type (or paste) the messages you see as "nick: text", and copy
// the lines meshhost prints back into bitchat. ">>>" lines go to the channel,
// "/msg nick …" lines are private messages.

import readline from "node:readline";
import { readFileSync } from "node:fs";
import { createSession, renderOutput } from "../src/engine/meshgame.js";
import { CATALOG, byId, defaultOptions } from "../src/catalog.js";
import { generate } from "../src/engine/sudoku.js";
import { parsePuzzleId } from "../src/games/sudoku.js";
import { dailyPuzzle, verifyDaily } from "../src/games/daily.js";
import { parseCell, cellName } from "../src/engine/commands.js";

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

in a session
  ghostnode: /sudo play R3C5=7          feed a message you saw
  !board  !score  !who  !quit           host shortcuts`);
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
      if (cmd === "help") return console.log(C.dim("!board !score !who !quit  ·  any line 'nick: text' is a chat message"));
      const as = session.players()[0] || "host";
      const map = { board: "/sync", score: "/score", who: "/who" };
      return print(session.receive(as, map[cmd] || `/${cmd}`, Date.now()));
    }
    const m = t.match(/^<?([^:>\s]+)>?:?\s+(.*)$/);
    if (!m) return console.log(C.red('format: "nick: message"'));
    print(session.receive(m[1], m[2], Date.now()));
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
      }
    }
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
