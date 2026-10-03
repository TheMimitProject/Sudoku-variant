import { describe, it, expect } from "vitest";
import { createSession } from "../src/engine/meshgame.js";
import sudoku, { parsePuzzleId } from "../src/games/sudoku.js";
import daily, { dailyProof, verifyDaily } from "../src/games/daily.js";
import { cellName } from "../src/engine/commands.js";

const texts = (outs) => outs.map((o) => o.text);
const empties = (state) => [...state.puzzle.keys()].filter((i) => !state.puzzle[i]);
const move = (state, i, v) => `/sudo play ${cellName(Math.floor(i / state.size), i % state.size)}=${v}`;

function solveAll(s, nick, from = 0) {
  let t = from;
  for (const i of empties(s.state)) {
    if (s.ended) break;
    s.receive(nick, move(s.state, i, s.state.solution[i]), (t += 10));
  }
  return t;
}

describe("Mesh Sudoku — race", () => {
  it("claims, penalises wrong guesses with a cooldown, and rejects claimed cells", () => {
    const s = createSession(sudoku, { seed: 1, options: { seed: 5 }, now: 0 });
    const st = s.state;
    const [i, j] = empties(st);
    expect(texts(s.receive("ann", move(st, i, st.solution[i]), 0))).toContain(`✓ ann: ${cellName(Math.floor(i / 9), i % 9)}=${st.solution[i]} (+1)`);
    expect(texts(s.receive("bob", move(st, i, st.solution[i]), 10))).toContain(`${cellName(Math.floor(i / 9), i % 9)} already claimed by ann`);
    const wrong = (st.solution[j] % 9) + 1;
    s.receive("bob", move(st, j, wrong), 20);
    expect(s.ctx.getScore("bob")).toBe(-1);
    expect(texts(s.receive("bob", move(st, j, st.solution[j]), 1000))[0]).toMatch(/cooldown/);
    s.receive("bob", move(st, j, st.solution[j]), 3100);
    expect(s.ctx.getScore("bob")).toBe(0);
  });

  it("a wrong guess on the last cell does not end the game (old bug)", () => {
    const s = createSession(sudoku, { seed: 2, options: { seed: 9 }, now: 0 });
    const st = s.state;
    const cells = empties(st);
    const last = cells.pop();
    let t = 0;
    for (const i of cells) s.receive("ann", move(st, i, st.solution[i]), (t += 10));
    s.receive("bob", move(st, last, (st.solution[last] % 9) + 1), (t += 10));
    expect(s.ended).toBe(false);
    s.receive("ann", move(st, last, st.solution[last]), (t += 10));
    expect(s.ended).toBe(true);
    expect(s.endLines[1]).toMatch(/ann/);
  });

  it("puzzle ids regenerate the same puzzle", () => {
    const s = createSession(sudoku, { options: { seed: 482913, difficulty: "hard" } });
    expect(parsePuzzleId("9.hard.482913")).toEqual({ size: 9, difficulty: "hard", seed: 482913 });
    expect(texts(s.intro).join()).toMatch("9.hard.482913");
  });
});

describe("Mesh Sudoku — territory", () => {
  it("awards a box bonus to the majority claimer", () => {
    const s = createSession(sudoku, { seed: 3, options: { mode: "territory", seed: 12 }, now: 0 });
    const st = s.state;
    const box0 = empties(st).filter((i) => Math.floor(i / 9) < 3 && i % 9 < 3);
    let t = 0;
    box0.forEach((i) => s.receive("ann", move(st, i, st.solution[i]), (t += 10)));
    expect(st.captured[0]).toBe("ann");
    expect(s.ctx.getScore("ann")).toBe(box0.length + 3);
  });
});

describe("Mesh Sudoku — blind co-op", () => {
  it("splits givens, lets players pass them, and finishes as a team", () => {
    const s = createSession(sudoku, { seed: 4, options: { mode: "blind", size: 6, seed: 3 }, now: 0 });
    const st = s.state;
    s.join("ann", 0);
    s.join("bob", 0);
    const annView = s.view("ann").cells;
    const hidden = annView.findIndex((c) => c.hiddenGiven);
    expect(hidden).toBeGreaterThanOrEqual(0);
    const name = cellName(Math.floor(hidden / 6), hidden % 6);
    expect(texts(s.receive("bob", `/sudo pass @ann ${name}`, 10))).toContain(`${name}=${st.puzzle[hidden]} (from bob)`);
    expect(s.view("ann").cells[hidden].hiddenGiven).toBe(false);
    solveAll(s, "ann", 20);
    expect(s.ended).toBe(true);
    expect(s.endLines[0]).toMatch(/Mesh solved it: .* 1 passes · 0 mistakes/);
  });
});

describe("Mesh Sudoku — relay", () => {
  it("puts players in teams of three with one band each", () => {
    const s = createSession(sudoku, { seed: 5, options: { mode: "relay", seed: 4 }, now: 0 });
    ["a", "b", "c", "d"].forEach((n) => s.join(n, 0));
    const v = s.view("a");
    expect(v.boardName).toBe("Team A");
    expect(v.bands).toEqual([0]);
    expect(s.view("d").boardName).toBe("Team B");
    const st = s.state;
    const outside = empties(st).find((i) => Math.floor(i / 9) >= 3);
    expect(texts(s.receive("a", move(st, outside, st.solution[outside]), 1))[0]).toMatch(/outside your band/);
  });
});

describe("Daily Mesh Puzzle", () => {
  it("is the same for everyone on a date and proofs verify", () => {
    const s = createSession(daily, { options: { date: "2026-10-03" }, now: 0 });
    const s2 = createSession(daily, { options: { date: "2026-10-03" }, now: 0 });
    expect(s.state.puzzle).toEqual(s2.state.puzzle);
    let t = 0;
    for (const i of empties(s.state)) s.receive("ann", `/daily play ${cellName(Math.floor(i / 9), i % 9)}=${s.state.solution[i]}`, (t += 1000));
    const out = texts(s.receive("ann", "/daily done", t));
    const proof = out.find((l) => l.includes("proof")).split("proof ")[1];
    expect(proof).toBe(dailyProof(s.state.solution, "2026-10-03", "ann"));
    expect(verifyDaily(s.state.solution, "2026-10-03", "ann", proof)).toBe(true);
    expect(verifyDaily(s.state.solution, "2026-10-03", "bob", proof)).toBe(false);
  });
});
