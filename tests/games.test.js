import { describe, it, expect } from "vitest";
import { createSession } from "../src/engine/meshgame.js";
import { CATALOG, defaultOptions } from "../src/catalog.js";
import hunt from "../src/games/hunt.js";
import battleship, { checkFleet, decodeFleet, randomFleet } from "../src/games/battleship.js";
import minesweeper from "../src/games/minesweeper.js";
import { generateNonogram, lineSolve, clueOf } from "../src/games/nonogram.js";
import { traceable, allWords, dictionary } from "../src/games/wordgrid.js";
import poll from "../src/tools/poll.js";
import checkin from "../src/tools/checkin.js";
import { parseRanges } from "../src/tools/pingtest.js";
import { createRng } from "../src/engine/rng.js";

const texts = (outs) => outs.map((o) => o.text);

describe("every game and tool", () => {
  it.each(CATALOG.map((e) => [e.module.id, e]))("%s runs with bots without crashing", (id, e) => {
    const s = createSession(e.module, { seed: 7, options: { ...defaultOptions(e), autoStart: 6, nightMs: 5000, dayMs: 5000, round: "30s" }, now: 0 });
    const nicks = ["a", "b", "c", "d", "e", "f"].slice(0, Math.max(2, Math.min(6, e.bots + 1)));
    nicks.forEach((n) => s.join(n, 0));
    let t = 0;
    for (let k = 0; k < 600 && !s.ended; k++) {
      t += 500;
      s.tick(t);
      const n = nicks[k % nicks.length];
      const mv = s.botMove(n);
      if (mv) s.receive(n, mv, t);
    }
    const finite = ["sudoku", "hunt", "battleship", "minesweeper", "nonogram", "wordgrid"];
    if (finite.includes(id)) expect(s.ended).toBe(true);
  });
});

describe("Mesh Hunt", () => {
  function setup(seed) {
    const s = createSession(hunt, { seed, options: { nightMs: 1000, dayMs: 1000, advanced: false }, now: 0 });
    ["a", "b", "c", "d", "e"].forEach((n) => s.join(n, 0));
    s.receive("a", "/hunt start", 0);
    return s;
  }

  it("deals exactly one jammer to five players and DMs roles", () => {
    const s = setup(1);
    const roles = Object.values(s.state.role);
    expect(roles.filter((r) => r === "jammer")).toHaveLength(1);
    expect(s.state.phase).toBe("night");
  });

  it("counted votes are the votes that were shown, and ties eliminate nobody", () => {
    const s = setup(2);
    s.tick(1500); // night times out → day
    expect(s.state.phase).toBe("day");
    const alive = s.state.order.filter((n) => s.state.alive[n]);
    const [x, y] = alive;
    const out = [];
    alive.forEach((n, k) => out.push(...s.receive(n, `/vote ${n === x ? y : n === y ? x : k % 2 ? x : y}`, 1600)));
    const shown = texts(out).filter((l) => l.startsWith("vote: "));
    expect(shown).toHaveLength(alive.length);
    const tallyLine = texts(out).find((l) => l.startsWith("🗳"));
    const xCount = shown.filter((l) => l.endsWith(` ${x}`)).length;
    expect(tallyLine).toContain(`${x}×${xCount}`);
  });

  it("an eliminated player becomes a spectator and the game keeps going", () => {
    const s = setup(3);
    s.tick(1500);
    const st = s.state;
    const victim = st.order.find((n) => st.role[n] !== "jammer");
    st.order.filter((n) => st.alive[n]).forEach((n) => s.receive(n, `/vote ${n === victim ? st.order.find((m) => m !== victim) : victim}`, 1600));
    expect(st.alive[victim]).toBe(false);
    expect(texts(s.receive(victim, "/vote a", 1700))).toContain("voting opens at dawn");
    expect(s.ended).toBe(false);
    expect(st.phase).toBe("night");
  });
});

describe("Battleship", () => {
  it("validates fleets", () => {
    expect(checkFleet(decodeFleet("A1h4,A2h3,A3h3,A4h2"))).toBeNull();
    expect(checkFleet(decodeFleet("A1h4,A1v3,A3h3,A4h2"))).toBe("ships overlap");
    expect(checkFleet(decodeFleet("F1h4,A2h3,A3h3,A4h2"))).toMatch(/runs off/);
    expect(checkFleet(randomFleet(createRng(1)))).toBeNull();
  });

  it("commitments verify at the end and catch a lie", () => {
    const s = createSession(battleship, { seed: 3, now: 0 });
    s.join("a", 0);
    s.join("b", 0);
    s.receive("a", "/fleet A1h4,A2h3,A3h3,A4h2", 0);
    s.receive("b", "/fleet A1h4,A2h3,A3h3,A4h2", 0);
    // Tamper: b "answers" one shot dishonestly.
    s.state.answers.push({ by: "b", r: 7, c: 7, hit: true });
    let t = 0;
    const targets = ["A1", "B1", "C1", "D1", "A2", "B2", "C2", "A3", "B3", "C3", "A4", "B4"];
    const misses = ["H8", "G8", "F8", "E8", "D8", "C8", "B8", "A8", "H7", "G7", "F7", "E7"];
    for (let k = 0; k < targets.length && !s.ended; k++) {
      s.receive("a", `/fire ${targets[k]}`, (t += 10));
      if (!s.ended) s.receive("b", `/fire ${misses[k]}`, (t += 10));
    }
    expect(s.ended).toBe(true);
    expect(s.endLines.join("\n")).toMatch(/a: commitment ✓ · answers ✓ honest/);
    expect(s.endLines.join("\n")).toMatch(/b: commitment ✓ · answers ✗ LIED/);
  });
});

describe("Minesweeper", () => {
  it("first dig is always safe and turns alternate", () => {
    const s = createSession(minesweeper, { seed: 4, options: { difficulty: "easy" }, now: 0 });
    s.join("a", 0);
    s.join("b", 0);
    const out = texts(s.receive("a", "/dig D4", 1));
    expect(out.some((l) => l.includes("⛏ a dug D4"))).toBe(true);
    expect(texts(s.receive("a", "/dig A1", 2))).toContain("one action per turn — let someone else go");
  });
});

describe("Nonogram", () => {
  it("clues and the line solver agree, puzzles are line-solvable", () => {
    expect(clueOf([1, 1, 0, 1, 0])).toEqual([2, 1]);
    expect(clueOf([0, 0])).toEqual([0]);
    const p = generateNonogram(createRng(9), 8);
    expect(lineSolve(p.rows, p.cols)).toEqual(p.grid);
  });
});

describe("Word Grid", () => {
  it("traces words on the grid including Qu", () => {
    const grid = "CATSQIEEXXXXXXXX".split("");
    expect(traceable(grid, "cats")).toBe(true);
    expect(traceable(grid, "cast")).toBe(false);
    expect(traceable(grid, "quit")).toBe(true); // Q face plays as "QU"
    expect(traceable(grid, "qit")).toBe(false);
    expect(dictionary().set.has("cats")).toBe(true);
    expect(allWords(grid)).toContain("cats");
  });
});

describe("tools", () => {
  it("poll counts one changeable vote per person", () => {
    const s = createSession(poll, { now: 0 });
    s.receive("a", "/poll new Meet where? | gate | food court", 0);
    s.receive("b", "/poll vote 1", 1);
    s.receive("b", "/poll vote 2", 2);
    s.receive("c", "/poll vote 2", 3);
    const res = texts(s.receive("a", "/poll results", 4));
    expect(res).toContain("1. gate — 0 (0%) ");
    expect(res).toContain("2. food court — 2 (100%) ██████████");
  });

  it("check-in board lists who still hasn't checked in", () => {
    const s = createSession(checkin, { now: 0 });
    s.receive("a", "/expect sam jo", 0);
    s.receive("sam", "/sos by the river", 1000);
    const roster = texts(s.receive("a", "/roster", 61000));
    expect(roster[0]).toMatch(/0 safe · 0 en route · 1 help · 1 no word/);
    expect(roster[1]).toMatch(/NEEDS HELP sam — by the river \(1m00s ago\)/);
  });

  it("ping test parses number ranges", () => {
    expect([...parseRanges("1-3,5 7")]).toEqual([1, 2, 3, 5, 7]);
  });
});
