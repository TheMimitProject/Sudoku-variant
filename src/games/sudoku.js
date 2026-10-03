// Mesh Sudoku — all the sudoku variants share one rules module.
//
//   race       first correct answer claims the cell (+1), wrong = -1 and a cooldown
//   territory  race, plus finishing a 3x3 box awards +3 to whoever claimed most of it
//   blind      co-op: the givens are split between players; trade them with /sudo pass
//   relay      teams of 3, each player owns one band (3 rows) and only sees its givens
//
// Size 9 is classic; size 6 is "Mini" (2x3 boxes, ~36-byte board).

import { generate, encode, formatBoard, boxIndex, nakedSingles, BOX } from "../engine/sudoku.js";
import { parseCell, cellName, cleanNick, formatDuration } from "../engine/commands.js";

export const MODES = {
  race: "Race — first correct answer claims the cell",
  territory: "Territory — capture boxes for bonus points",
  blind: "Blind — co-op, givens split between players",
  relay: "Relay — teams, each player owns one band",
};

const COOP = new Set(["blind", "relay"]);
const TEAM_NAMES = ["A", "B", "C", "D", "E", "F"];
const BOX_BONUS = 3;

/** Puzzle IDs let anyone regenerate the exact puzzle offline: "9.medium.482913". */
export const puzzleId = (s) => `${s.size}.${s.difficulty}.${s.seed}`;
export function parsePuzzleId(id) {
  const m = String(id).match(/^(\d)\.(easy|medium|hard)\.(\S+)$/);
  if (!m) return null;
  const seed = /^\d+$/.test(m[3]) ? Number(m[3]) : m[3];
  return { size: Number(m[1]), difficulty: m[2], seed };
}

const bandOf = (i, size) => Math.floor(Math.floor(i / size) / BOX[size][0]);
const bandCount = (size) => size / BOX[size][0];

function newBoard(state, id, name) {
  return {
    id,
    name,
    members: [],
    grid: state.puzzle.slice(),
    by: new Array(state.puzzle.length).fill(null),
    passes: 0,
    mistakes: 0,
    done: false,
    finishedAt: null,
  };
}

/** Givens this player starts out knowing (co-op modes). */
function assignedGivens(state, board, nick) {
  const size = state.size;
  const idx = board.members.indexOf(nick);
  const n = board.members.length || 1;
  const out = new Set();
  if (state.mode === "blind") {
    // Givens dealt round-robin in a seeded shuffled order.
    state.givenOrder.forEach((cell, k) => {
      if (k % n === idx) out.add(cell);
    });
  } else if (state.mode === "relay") {
    for (let i = 0; i < state.puzzle.length; i++) {
      if (state.puzzle[i] && myBands(state, board, nick).includes(bandOf(i, size))) out.add(i);
    }
  }
  return out;
}

export function myBands(state, board, nick) {
  const idx = board.members.indexOf(nick);
  const n = Math.max(1, board.members.length);
  const bands = [];
  for (let b = 0; b < bandCount(state.size); b++) if (b % n === idx) bands.push(b);
  return bands;
}

/** Does `nick` know the value at cell i? */
function knows(state, board, nick, i) {
  if (!COOP.has(state.mode)) return true;
  if (board.by[i]) return true; // placed cells are shared with the board
  if (!state.puzzle[i]) return false;
  return assignedGivens(state, board, nick).has(i) || (state.received[nick]?.has(i) ?? false);
}

/** The grid as `nick` sees it: unknown givens are 0. */
function knownGrid(state, board, nick) {
  return board.grid.map((v, i) => (knows(state, board, nick, i) ? v : 0));
}

function boardFor(state, nick) {
  return state.boards.find((b) => b.id === state.boardOf[nick]);
}

function joinBoard(ctx, state, nick) {
  if (state.boardOf[nick] != null) return boardFor(state, nick);
  let board;
  if (state.mode === "relay") {
    board = state.boards.find((b) => b.members.length < state.teamSize && !b.done);
    if (!board) {
      const k = state.boards.length;
      board = newBoard(state, k, `Team ${TEAM_NAMES[k] || k + 1}`);
      state.boards.push(board);
    }
  } else {
    board = state.boards[0];
  }
  board.members.push(nick);
  state.boardOf[nick] = board.id;
  if (state.letters[nick] == null) state.letters[nick] = Object.keys(state.letters).length;
  if (state.mode === "relay") {
    ctx.say(`${nick} → ${board.name} (bands ${myBands(state, board, nick).map((b) => b + 1).join(",")})`);
  }
  return board;
}

function boardLines(state, board, nick) {
  const size = state.size;
  const coop = COOP.has(state.mode);
  const marks = board.grid.map((v, i) => {
    if (!coop) return v ? String(v) : ".";
    if (!knows(state, board, nick, i)) return state.puzzle[i] ? "?" : ".";
    return v ? String(v) : ".";
  });
  const left = board.grid.filter((v) => !v).length;
  return [
    `BOARD ${board.name !== "main" ? board.name + " " : ""}(${state.size === 6 ? "mini" : state.difficulty}, ${left} left)`,
    ...formatBoard(board.grid, size, marks),
  ];
}

function codeFor(state, board) {
  const claims = board.by.map((n) => (n == null ? null : state.letters[n]));
  return encode(state.puzzle, claims);
}

function finishLines(ctx, state) {
  if (COOP.has(state.mode)) {
    const done = state.boards.filter((b) => b.done).sort((a, b) => a.finishedAt - b.finishedAt);
    return done.map((b, k) => {
      const t = formatDuration(b.finishedAt - state.startedAt);
      const label = state.mode === "relay" ? `${k === 0 ? "🏆 " : ""}${b.name} (${b.members.join(", ")})` : "Mesh solved it";
      return `${label}: ${t} · ${b.passes} passes · ${b.mistakes} mistakes`;
    });
  }
  const medals = ["🏆", "🥈", "🥉"];
  return [
    "PUZZLE COMPLETE!",
    ...ctx.standings().map((p, k) => `${medals[k] || "  "} ${k + 1}. ${p.nick} ${p.score}`),
  ];
}

function checkTerritory(ctx, state, board, i) {
  const size = state.size;
  const bx = boxIndex(i, size);
  const cells = [...board.grid.keys()].filter((k) => boxIndex(k, size) === bx);
  if (cells.some((k) => !board.grid[k])) return;
  const counts = {};
  cells.forEach((k) => {
    const n = board.by[k];
    if (n) counts[n] = (counts[n] || 0) + 1;
  });
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return;
  if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) {
    ctx.say(`box ${bx + 1} complete — tied, no capture`);
    return;
  }
  const [owner, n] = ranked[0];
  state.captured[bx] = owner;
  ctx.score(owner, BOX_BONUS);
  ctx.say(`⬛ box ${bx + 1} captured: ${owner} (${n} cells) +${BOX_BONUS}`);
}

function play(ctx, state, nick, args) {
  const cell = parseCell(args.join(" "), state.size);
  if (!cell || cell.v == null) {
    ctx.dm(nick, `usage: /sudo play R3C5=7 (rows/cols 1-${state.size})`);
    return;
  }
  const board = joinBoard(ctx, state, nick);
  if (board.done) return ctx.dm(nick, `${board.name} is already solved`);
  const i = cell.r * state.size + cell.c;
  const name = cellName(cell.r, cell.c);
  if (state.puzzle[i]) return ctx.dm(nick, `${name} is a given`);
  if (board.grid[i]) return ctx.dm(nick, `${name} already claimed by ${board.by[i]}`);
  if (state.mode === "relay" && !myBands(state, board, nick).includes(bandOf(i, state.size))) {
    return ctx.dm(nick, `${name} is outside your band — /sudo pass it to a teammate instead`);
  }

  if (cell.v === state.solution[i]) {
    board.grid[i] = cell.v;
    board.by[i] = nick;
    ctx.score(nick, 1);
    if (state.mode === "relay") {
      ctx.say(`✓ [${board.name}] ${nick}: ${name}`);
      board.members.filter((m) => m !== nick).forEach((m) => ctx.dm(m, `${name}=${cell.v} (placed by ${nick})`));
    } else {
      ctx.say(`✓ ${nick}: ${name}=${cell.v} (+1)`);
    }
    if (state.mode === "territory") checkTerritory(ctx, state, board, i);
    if (!COOP.has(state.mode) && ++state.claimsSinceSync >= state.syncEvery) {
      state.claimsSinceSync = 0;
      ctx.say(`SYNC ${codeFor(state, board)}`);
    }
    if (board.grid.every(Boolean)) {
      board.done = true;
      board.finishedAt = ctx.now;
      if (state.mode === "relay" && state.boards.some((b) => !b.done)) {
        ctx.say(`🏁 ${board.name} finished in ${formatDuration(ctx.now - state.startedAt)}!`);
      } else {
        ctx.end(finishLines(ctx, state));
      }
    }
  } else {
    // Wrong guesses are never written to the board, so they can't end the game.
    if (COOP.has(state.mode)) board.mistakes++;
    else ctx.score(nick, -state.wrongPenalty);
    ctx.cooldown(nick, state.cooldownMs);
    const pen = COOP.has(state.mode) ? "mistake" : `-${state.wrongPenalty}`;
    ctx.say(`✗ ${nick}: ${name} wrong (${pen}, ${Math.round(state.cooldownMs / 1000)}s cooldown)`);
  }
}

function pass(ctx, state, nick, args) {
  if (!COOP.has(state.mode)) return ctx.dm(nick, "/sudo pass only works in blind and relay modes");
  const to = cleanNick(args[0]);
  const cell = parseCell(args.slice(1).join(" "), state.size);
  const board = joinBoard(ctx, state, nick);
  if (!to || !cell) return ctx.dm(nick, "usage: /sudo pass @nick R3C5");
  if (!board.members.includes(to) || to === nick) return ctx.dm(nick, `${to} isn't on your team`);
  const i = cell.r * state.size + cell.c;
  const name = cellName(cell.r, cell.c);
  if (!state.puzzle[i]) return ctx.dm(nick, `${name} isn't a given — only givens can be passed`);
  if (!knows(state, board, nick, i)) return ctx.dm(nick, `you don't know ${name} yet`);
  if (knows(state, board, to, i)) return ctx.dm(nick, `${to} already knows ${name}`);
  (state.received[to] ||= new Set()).add(i);
  board.passes++;
  ctx.dm(to, `${name}=${state.puzzle[i]} (from ${nick})`);
  ctx.say(`↪ ${nick} → ${to}: ${name}`);
}

export default {
  id: "sudoku",
  name: "Mesh Sudoku",
  channel: "#sudoku",
  summary: "competitive and co-op sudoku over the mesh",
  minPlayers: 1,
  maxPlayers: 12,

  create(ctx, o) {
    const size = o.size === 6 ? 6 : 9;
    const difficulty = ["easy", "medium", "hard"].includes(o.difficulty) ? o.difficulty : "medium";
    const seed = o.seed ?? Math.floor(ctx.rng() * 1e9);
    const p = generate({ size, difficulty, seed });
    const state = {
      mode: MODES[o.mode] ? o.mode : "race",
      size,
      difficulty,
      seed,
      puzzle: p.puzzle,
      solution: p.solution,
      clues: p.clues,
      boards: [],
      boardOf: {},
      letters: {},
      received: {},
      captured: {},
      teamSize: o.teamSize ?? 3,
      wrongPenalty: o.wrongPenalty ?? 1,
      cooldownMs: o.cooldownMs ?? 3000,
      syncEvery: o.syncEvery ?? 8,
      claimsSinceSync: 0,
      startedAt: ctx.now,
      givenOrder: ctx.rng.shuffle([...p.puzzle.keys()].filter((i) => p.puzzle[i])),
    };
    if (state.mode !== "relay") state.boards.push(newBoard(state, 0, "main"));
    return state;
  },

  start(ctx, state) {
    ctx.say(`MESH SUDOKU · ${state.mode} · ${state.size === 6 ? "mini 6x6" : state.difficulty} · ${state.puzzle.filter((v) => !v).length} cells`);
    ctx.say(`puzzle ${puzzleId(state)} — anyone can verify moves offline`);
  },

  onJoin(ctx, state, nick) {
    joinBoard(ctx, state, nick);
  },

  /** Late-join sync is kept to two short lines; /sudo show sends the full grid. */
  snapshot(ctx, state, nick) {
    const board = joinBoard(ctx, state, nick);
    const left = board.grid.filter((v) => !v).length;
    const lines = [`puzzle ${puzzleId(state)} · ${state.mode} · ${left} left · /sudo show for the grid`];
    if (COOP.has(state.mode)) {
      const known = board.grid.map((v, i) => (knows(state, board, nick, i) ? (v ? String(v) : ".") : "?")).join("");
      lines.push(`KNOWN ${known}`);
      if (state.mode === "relay") lines.push(`${board.name} · your bands: ${myBands(state, board, nick).map((b) => b + 1).join(",")}`);
    } else lines.push(`CODE ${codeFor(state, board)}`);
    return lines;
  },

  commands: [
    { name: "sudo play", aliases: ["play", "p"], usage: "sudo play R3C5=7", desc: "place a digit", run: play },
    {
      name: "sudo show",
      aliases: ["show", "board"],
      usage: "sudo show",
      desc: "show the board",
      readOnly: true,
      run(ctx, state, nick) {
        const board = joinBoard(ctx, state, nick);
        const lines = boardLines(state, board, nick);
        if (COOP.has(state.mode)) ctx.dmLines(nick, lines);
        else ctx.sayLines(lines);
      },
    },
    {
      name: "sudo code",
      usage: "sudo code",
      desc: "compact 81-char board (a–z = claimed by player)",
      readOnly: true,
      run(ctx, state, nick) {
        ctx.say(`CODE ${codeFor(state, joinBoard(ctx, state, nick))}`);
      },
    },
    {
      name: "sudo score",
      aliases: ["score"],
      usage: "sudo score",
      desc: "scoreboard",
      readOnly: true,
      run(ctx, state) {
        if (COOP.has(state.mode)) {
          state.boards.forEach((b) => {
            const left = b.grid.filter((v) => !v).length;
            ctx.say(`${b.name === "main" ? "team" : b.name}: ${left} left · ${b.passes} passes · ${b.mistakes} mistakes`);
          });
        } else ctx.sayLines(ctx.scoreLines());
      },
    },
    { name: "sudo pass", aliases: ["pass"], usage: "sudo pass @nick R3C5", desc: "co-op: send a given you know to a teammate", run: pass },
    {
      name: "sudo check",
      usage: "sudo check",
      desc: "validate the board",
      readOnly: true,
      run(ctx, state, nick) {
        const board = joinBoard(ctx, state, nick);
        const bad = board.grid.filter((v, i) => v && v !== state.solution[i]).length;
        const left = board.grid.filter((v) => !v).length;
        ctx.say(bad ? `✗ ${bad} conflicts` : `✓ board valid · ${left} cells left`);
      },
    },
    {
      name: "sudo seed",
      usage: "sudo seed",
      desc: "puzzle id for offline verification",
      readOnly: true,
      run(ctx, state) {
        ctx.say(`puzzle ${puzzleId(state)} · verify: meshhost verify ${puzzleId(state)} R3C5=7`);
      },
    },
  ],

  bot(ctx, state, nick) {
    const board = joinBoard(ctx, state, nick);
    if (board.done) return null;
    const rng = ctx.rng;
    const size = state.size;
    const coop = COOP.has(state.mode);
    const view = coop ? knownGrid(state, board, nick) : board.grid;
    const allowed = (i) =>
      !board.grid[i] &&
      !(coop && state.puzzle[i]) &&
      (state.mode !== "relay" || myBands(state, board, nick).includes(bandOf(i, size)));

    if (coop) {
      const mates = board.members.filter((m) => m !== nick);
      const singles = nakedSingles(view, size).filter((s) => allowed(s.i));
      if (mates.length && (rng.chance(0.45) || !singles.length)) {
        const offers = [];
        for (const m of mates) {
          for (let i = 0; i < state.puzzle.length; i++) {
            if (state.puzzle[i] && knows(state, board, nick, i) && !knows(state, board, m, i)) offers.push([m, i]);
          }
        }
        if (offers.length) {
          const [m, i] = rng.pick(offers);
          return `/sudo pass @${m} ${cellName(Math.floor(i / size), i % size)}`;
        }
      }
      if (singles.length) {
        const s = rng.pick(singles);
        return `/sudo play ${cellName(Math.floor(s.i / size), s.i % size)}=${s.v}`;
      }
      return null;
    }

    const singles = nakedSingles(view, size);
    let i, v;
    if (singles.length && rng.chance(0.85)) {
      ({ i, v } = rng.pick(singles));
      if (rng.chance(0.06)) v = (v % size) + 1;
    } else {
      const empty = [...view.keys()].filter(allowed);
      if (!empty.length) return null;
      i = rng.pick(empty);
      v = rng.chance(0.45) ? state.solution[i] : rng.int(size) + 1;
    }
    return `/sudo play ${cellName(Math.floor(i / size), i % size)}=${v}`;
  },

  view(state, nick) {
    const board = boardFor(state, nick) || state.boards[0];
    if (!board) return null;
    const coop = COOP.has(state.mode);
    return {
      mode: state.mode,
      size: state.size,
      box: BOX[state.size],
      boardName: board.name,
      members: board.members,
      passes: board.passes,
      mistakes: board.mistakes,
      done: board.done,
      bands: state.mode === "relay" ? myBands(state, board, nick) : null,
      captured: state.captured,
      letters: state.letters,
      cells: board.grid.map((v, i) => {
        const known = knows(state, board, nick, i);
        return {
          v: known ? v : 0,
          given: !!state.puzzle[i],
          hiddenGiven: coop && !!state.puzzle[i] && !known,
          by: board.by[i],
          box: boxIndex(i, state.size),
          band: bandOf(i, state.size),
        };
      }),
      boards: state.boards.map((b) => ({ name: b.name, members: b.members, left: b.grid.filter((x) => !x).length, done: b.done })),
    };
  },
};
