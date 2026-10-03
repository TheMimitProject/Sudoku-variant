// Mesh Battleship — two players, no trusted host.
//
// Each player places a fleet privately and posts a commitment hash. Shots and
// answers go over the channel. At the end both fleets are revealed and every
// client checks the reveal against the commitment AND against every answer
// given during the game, so lying about hits is caught.

import { commit, verify, makeSalt } from "../engine/commit.js";
import { parseCoord, coordName } from "../engine/commands.js";

export const SIZE = 8;
export const FLEET = [4, 3, 3, 2];

/** Layout string: "A1h4,C3v3,…" — top-left coordinate, h/v, length. */
export function encodeFleet(ships) {
  return ships.map((s) => `${coordName(s.r, s.c)}${s.dir}${s.len}`).join(",");
}

export function decodeFleet(str) {
  return String(str)
    .split(",")
    .map((t) => t.trim().toUpperCase().match(/^([A-Z]\d{1,2})([HV])(\d)$/))
    .map((m) => {
      if (!m) return null;
      const p = parseCoord(m[1], SIZE, SIZE);
      return p && { r: p.r, c: p.c, dir: m[2].toLowerCase(), len: Number(m[3]) };
    });
}

export function shipCells(s) {
  return Array.from({ length: s.len }, (_, k) => (s.dir === "h" ? [s.r, s.c + k] : [s.r + k, s.c]));
}

/** Validates bounds, overlaps and the required ship lengths. Returns an error string or null. */
export function checkFleet(ships) {
  if (ships.some((s) => !s)) return "bad ship format (use A1h4)";
  const lens = ships.map((s) => s.len).sort().join();
  if (lens !== [...FLEET].sort().join()) return `fleet must be lengths ${FLEET.join(",")}`;
  const seen = new Set();
  for (const s of ships) {
    for (const [r, c] of shipCells(s)) {
      if (r >= SIZE || c >= SIZE) return `${coordName(s.r, s.c)} runs off the board`;
      if (seen.has(`${r},${c}`)) return "ships overlap";
      seen.add(`${r},${c}`);
    }
  }
  return null;
}

export function randomFleet(rng) {
  for (;;) {
    const ships = FLEET.map((len) => {
      const dir = rng.chance(0.5) ? "h" : "v";
      return { r: rng.int(dir === "v" ? SIZE - len + 1 : SIZE), c: rng.int(dir === "h" ? SIZE - len + 1 : SIZE), dir, len };
    });
    if (!checkFleet(ships)) return ships;
  }
}

const occupied = (ships) => new Set(ships.flatMap(shipCells).map(([r, c]) => `${r},${c}`));

function placeFleet(ctx, state, nick, ships) {
  const err = checkFleet(ships);
  if (err) return ctx.dm(nick, `✗ ${err}`);
  const salt = makeSalt(ctx.rng);
  const layout = encodeFleet(ships);
  const p = state.p[nick];
  Object.assign(p, { ships, salt, layout, cells: occupied(ships), commitment: commit(layout, salt) });
  ctx.dm(nick, `your fleet ${layout} (keep secret) · salt ${salt}`);
  ctx.say(`fleet committed: ${nick} ${p.commitment}`);
  if (state.seats.every((n) => state.p[n]?.commitment)) {
    state.phase = "battle";
    state.turn = state.seats[0];
    ctx.say(`⚓ BATTLE — first shot: ${state.turn}. /fire B7`);
  }
}

function sunkShip(target, r, c, shots) {
  const ship = target.ships.find((s) => shipCells(s).some(([rr, cc]) => rr === r && cc === c));
  return ship && shipCells(ship).every(([rr, cc]) => shots.has(`${rr},${cc}`)) ? ship : null;
}

function reveal(ctx, state) {
  state.phase = "over";
  const lines = [];
  for (const n of state.seats) {
    const p = state.p[n];
    ctx.say(`${n} reveals ${p.layout} salt ${p.salt}`);
    const okCommit = verify(p.commitment, p.layout, p.salt);
    const honest = state.answers.filter((a) => a.by === n).every((a) => a.hit === p.cells.has(`${a.r},${a.c}`));
    lines.push(`${n}: commitment ${okCommit ? "✓" : "✗ MISMATCH"} · answers ${honest ? "✓ honest" : "✗ LIED"}`);
  }
  ctx.end([`🏆 ${state.winner} sinks the whole fleet!`, ...lines]);
}

/** Your view of the opponent's waters: x = hit, o = miss. */
export function gridLines(state, opp) {
  const hits = new Set(state.answers.filter((a) => a.by === opp && a.hit).map((a) => `${a.r},${a.c}`));
  const misses = new Set(state.answers.filter((a) => a.by === opp && !a.hit).map((a) => `${a.r},${a.c}`));
  const head = "   " + Array.from({ length: SIZE }, (_, c) => String.fromCharCode(65 + c)).join(" ");
  return [
    head,
    ...Array.from({ length: SIZE }, (_, r) =>
      String(r + 1).padStart(2) + " " + Array.from({ length: SIZE }, (_, c) => (hits.has(`${r},${c}`) ? "x" : misses.has(`${r},${c}`) ? "o" : ".")).join(" ")
    ),
  ];
}

export default {
  id: "battleship",
  name: "Mesh Battleship",
  channel: "#battleship",
  summary: "2 players, committed fleets, verified at the end",
  minPlayers: 2,
  maxPlayers: 2,

  create() {
    return { seats: [], p: {}, phase: "setup", turn: null, answers: [], winner: null };
  },

  start(ctx) {
    ctx.say(`MESH BATTLESHIP · ${SIZE}x${SIZE} · fleet ${FLEET.join(",")} · /fleet auto or /fleet A1h4,C3v3,E5h3,H1v2`);
  },

  onJoin(ctx, state, nick) {
    if (state.seats.includes(nick)) return;
    if (state.seats.length < 2) {
      state.seats.push(nick);
      state.p[nick] = { shots: new Set(), hits: 0 };
      ctx.say(`seat ${state.seats.length}: ${nick}`);
    } else ctx.dm(nick, "both seats taken — you're spectating");
  },

  snapshot(ctx, state, nick) {
    const lines = [`phase ${state.phase}${state.turn ? ` · ${state.turn} to fire` : ""}`];
    const opp = state.seats.find((n) => n !== nick);
    if (state.p[nick] && opp) lines.push(...gridLines(state, opp));
    return lines;
  },

  commands: [
    {
      name: "fleet",
      usage: "fleet auto | fleet A1h4,C3v3,E5h3,H1v2",
      desc: "place your fleet and post its commitment",
      run(ctx, state, nick, args) {
        if (!state.seats.includes(nick)) return ctx.dm(nick, "spectators can't place fleets");
        if (state.phase !== "setup") return ctx.dm(nick, "fleets are locked");
        if (state.p[nick].commitment) return ctx.dm(nick, "fleet already committed");
        const arg = args.join("");
        placeFleet(ctx, state, nick, !arg || arg.toLowerCase() === "auto" ? randomFleet(ctx.rng) : decodeFleet(arg));
      },
    },
    {
      name: "fire",
      usage: "fire B7",
      desc: "shoot at the opponent",
      run(ctx, state, nick, args) {
        if (state.phase !== "battle") return ctx.dm(nick, "not in battle yet");
        if (state.turn !== nick) return ctx.dm(nick, `it's ${state.turn}'s turn`);
        const pt = parseCoord(args[0], SIZE, SIZE);
        if (!pt) return ctx.dm(nick, "usage: /fire B7 (A–H, 1–8)");
        const me = state.p[nick];
        const key = `${pt.r},${pt.c}`;
        if (me.shots.has(key)) return ctx.dm(nick, `already fired at ${coordName(pt.r, pt.c)}`);
        me.shots.add(key);
        const opp = state.seats.find((n) => n !== nick);
        const target = state.p[opp];
        // The defender's own client answers; we record the answer for the end-of-game audit.
        const hit = target.cells.has(key);
        state.answers.push({ by: opp, r: pt.r, c: pt.c, hit });
        if (hit) {
          me.hits++;
          const sunk = sunkShip(target, pt.r, pt.c, me.shots);
          ctx.say(`💥 ${nick} → ${coordName(pt.r, pt.c)} HIT${sunk ? ` — sunk a ${sunk.len}!` : ""}`);
          if (me.hits === target.cells.size) {
            state.winner = nick;
            return reveal(ctx, state);
          }
        } else {
          ctx.say(`🌊 ${nick} → ${coordName(pt.r, pt.c)} miss`);
        }
        state.turn = opp;
      },
    },
    {
      name: "grid",
      usage: "grid",
      desc: "your shots on the opponent",
      readOnly: true,
      run(ctx, state, nick) {
        const opp = state.seats.find((n) => n !== nick);
        if (opp) ctx.dmLines(nick, gridLines(state, opp));
      },
    },
  ],

  bot(ctx, state, nick) {
    if (!state.seats.includes(nick)) return null;
    if (state.phase === "setup") return state.p[nick].commitment ? null : "/fleet auto";
    if (state.phase !== "battle" || state.turn !== nick) return null;
    const me = state.p[nick];
    const opp = state.seats.find((n) => n !== nick);
    const hits = state.answers.filter((a) => a.by === opp && a.hit);
    // Target mode: shoot next to unresolved hits.
    const around = [];
    for (const h of hits) {
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const r = h.r + dr, c = h.c + dc;
        if (r >= 0 && c >= 0 && r < SIZE && c < SIZE && !me.shots.has(`${r},${c}`)) around.push([r, c]);
      }
    }
    let pick = around.length ? ctx.rng.pick(around) : null;
    if (!pick) {
      const free = [];
      for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if ((r + c) % 2 === 0 && !me.shots.has(`${r},${c}`)) free.push([r, c]);
      if (!free.length) for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (!me.shots.has(`${r},${c}`)) free.push([r, c]);
      pick = ctx.rng.pick(free);
    }
    return `/fire ${coordName(pick[0], pick[1])}`;
  },

  view(state, nick) {
    const opp = state.seats.find((n) => n !== nick);
    const mine = state.p[nick]?.cells;
    const incoming = new Set(state.answers.filter((a) => a.by === nick).map((a) => `${a.r},${a.c}`));
    const own = mine
      ? Array.from({ length: SIZE }, (_, r) =>
          String(r + 1).padStart(2) + " " + Array.from({ length: SIZE }, (_, c) => {
            const k = `${r},${c}`;
            return mine.has(k) ? (incoming.has(k) ? "x" : "■") : incoming.has(k) ? "o" : ".";
          }).join(" ")
        )
      : [];
    return {
      phase: state.phase,
      turn: state.turn,
      seats: state.seats,
      winner: state.winner,
      lines: opp ? ["their waters", ...gridLines(state, opp), "", "your fleet", ...own] : ["waiting for an opponent"],
    };
  },
};
