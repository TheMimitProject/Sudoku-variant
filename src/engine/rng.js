// Seeded, deterministic randomness. Every client that knows the seed
// generates the exact same puzzle, which is what makes hostless play work.

/** Hash any string to a 32-bit unsigned seed (FNV-1a). */
export function seedFrom(value) {
  const str = String(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 PRNG. Returns a function producing floats in [0, 1). */
export function createRng(seed = Date.now()) {
  let a = typeof seed === "number" ? seed >>> 0 : seedFrom(seed);
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.int = (n) => Math.floor(next() * n);
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  next.shuffle = (arr) => {
    const a2 = [...arr];
    for (let i = a2.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [a2[i], a2[j]] = [a2[j], a2[i]];
    }
    return a2;
  };
  next.chance = (p) => next() < p;
  return next;
}

/** Today's date as YYYY-MM-DD in UTC, used as the Daily Mesh Puzzle seed. */
export function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}
