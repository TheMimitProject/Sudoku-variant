import { describe, it, expect } from "vitest";
import { sha256 } from "../src/engine/sha256.js";
import { commit, verify } from "../src/engine/commit.js";
import { createRng, seedFrom } from "../src/engine/rng.js";
import { parseCell, parseCoord, parseDuration, tokenize, cellName } from "../src/engine/commands.js";
import { generate, countSolutions, encode, decode, formatBoard, solve } from "../src/engine/sudoku.js";
import { createSession } from "../src/engine/meshgame.js";

describe("sha256", () => {
  it("matches known vectors", () => {
    expect(sha256("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256("a".repeat(1000))).toBe("41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3");
  });
});

describe("commit-reveal", () => {
  it("verifies the right secret and rejects changes", () => {
    const c = commit("A1h4,C3v3", "salt123");
    expect(verify(c, "A1h4,C3v3", "salt123")).toBe(true);
    expect(verify(c, "A1h4,C3v2", "salt123")).toBe(false);
    expect(verify(c, "A1h4,C3v3", "salt124")).toBe(false);
  });
});

describe("rng", () => {
  it("is deterministic per seed", () => {
    const a = createRng(42), b = createRng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(seedFrom("daily:2026-10-03")).toBe(seedFrom("daily:2026-10-03"));
  });
});

describe("command parsing", () => {
  it("parses cells in several spellings", () => {
    expect(parseCell("R3C5=7")).toEqual({ r: 2, c: 4, v: 7 });
    expect(parseCell("r3c5 7")).toEqual({ r: 2, c: 4, v: 7 });
    expect(parseCell("3,5=7")).toEqual({ r: 2, c: 4, v: 7 });
    expect(parseCell("R3C5")).toEqual({ r: 2, c: 4 });
    expect(parseCell("R10C1=1")).toBeNull();
    expect(parseCell("R1C1=7", 6)).toBeNull();
    expect(cellName(2, 4)).toBe("R3C5");
  });
  it("parses coordinates, durations and commands", () => {
    expect(parseCoord("b7")).toEqual({ r: 6, c: 1 });
    expect(parseCoord("Z1", 8, 8)).toBeNull();
    expect(parseDuration("1m30s")).toBe(90000);
    expect(parseDuration("45")).toBe(45000);
    expect(tokenize("/sudo  play R1C1=1")).toEqual(["sudo", "play", "R1C1=1"]);
    expect(tokenize("hello")).toBeNull();
  });
});

describe("sudoku generator", () => {
  it.each([
    [9, "easy"],
    [9, "medium"],
    [9, "hard"],
    [6, "medium"],
  ])("%ix%i %s puzzles have exactly one solution", (size, difficulty) => {
    for (let seed = 0; seed < 5; seed++) {
      const p = generate({ size, difficulty, seed });
      expect(countSolutions(p.puzzle, size, 2)).toBe(1);
      expect(solve(p.puzzle, size)).toEqual(p.solution);
      p.puzzle.forEach((v, i) => v && expect(v).toBe(p.solution[i]));
    }
  });

  it("is deterministic for a seed (hostless play depends on it)", () => {
    expect(generate({ seed: 482913 }).puzzle).toEqual(generate({ seed: 482913 }).puzzle);
  });

  it("encodes and decodes boards with claim letters", () => {
    const p = generate({ seed: 1 });
    const claims = p.puzzle.map((v, i) => (!v && i % 7 === 0 ? 1 : null));
    const code = encode(p.puzzle, claims);
    expect(code).toHaveLength(81);
    expect(code).toMatch(/b/);
    const back = decode(code, p.solution);
    expect(back.claims).toEqual(claims);
    back.grid.forEach((v, i) => claims[i] != null && expect(v).toBe(p.solution[i]));
    expect(formatBoard(p.puzzle)[3]).toBe("------+-------+------");
  });
});

describe("meshgame session", () => {
  const echo = {
    id: "echo",
    name: "Echo",
    create: () => ({ hits: 0 }),
    commands: [
      { name: "hit", run: (ctx, s, nick) => { s.hits++; ctx.score(nick, 1); ctx.cooldown(nick, 1000); ctx.say(`${nick} hit`); } },
      { name: "later", run: (ctx) => ctx.after(500, () => ctx.say("ding")) },
    ],
    snapshot: (ctx, s) => [`hits ${s.hits}`],
  };

  it("auto-joins, enforces cooldowns and runs timers", () => {
    const s = createSession(echo, { now: 0 });
    const a = s.receive("ann", "/hit", 0);
    expect(a.some((o) => o.text === "ann joined #mesh")).toBe(true);
    expect(a.some((o) => o.to === "ann" && o.text === "hits 0")).toBe(true);
    expect(s.receive("ann", "/hit", 500).map((o) => o.text)).toEqual(["cooldown: wait 1s"]);
    expect(s.receive("ann", "/hit", 1200).map((o) => o.text)).toEqual(["ann hit"]);
    s.receive("bob", "/later", 1300);
    expect(s.tick(1700)).toEqual([]);
    expect(s.tick(1800)).toEqual([{ to: "*", text: "ding" }]);
    expect(s.standings()[0]).toEqual({ nick: "ann", score: 2 });
  });
});
