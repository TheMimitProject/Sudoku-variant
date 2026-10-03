// Parsers for the text commands players type into bitchat.
// Kept forgiving: people type fast on phones over a laggy mesh.

/** Split "/sudo play R3C5=7" into ["sudo", "play", "R3C5=7"]. Returns null if not a command. */
export function tokenize(text) {
  const t = String(text || "").trim();
  if (!t.startsWith("/")) return null;
  return t.slice(1).split(/\s+/).filter(Boolean);
}

/**
 * Parse a sudoku cell move. Accepts:
 *   R3C5=7   r3c5 7   R3C5:7   3,5=7   3 5 7
 * Returns { r, c, v } zero-based r/c, or null. `v` is omitted when absent (e.g. "R3C5").
 */
export function parseCell(input, size = 9) {
  const s = String(input || "").trim().toUpperCase().replace(/\s+/g, " ");
  let m = s.match(/^R(\d+)\s*C(\d+)(?:\s*[=: ]\s*(\d+))?$/);
  if (!m) m = s.match(/^(\d+)\s*[, ]\s*(\d+)(?:\s*[=: ]\s*(\d+))?$/);
  if (!m) return null;
  const r = Number(m[1]) - 1;
  const c = Number(m[2]) - 1;
  if (r < 0 || c < 0 || r >= size || c >= size) return null;
  const out = { r, c };
  if (m[3] !== undefined) {
    const v = Number(m[3]);
    if (v < 1 || v > size) return null;
    out.v = v;
  }
  return out;
}

export const cellName = (r, c) => `R${r + 1}C${c + 1}`;

/** Battleship / minesweeper style coordinate: "B7" → { r: 6, c: 1 } (letter = column, number = row). */
export function parseCoord(input, rows = 10, cols = 10) {
  const m = String(input || "").trim().toUpperCase().match(/^([A-Z])\s*(\d{1,2})$/);
  if (!m) return null;
  const c = m[1].charCodeAt(0) - 65;
  const r = Number(m[2]) - 1;
  if (r < 0 || c < 0 || r >= rows || c >= cols) return null;
  return { r, c };
}

export const coordName = (r, c) => `${String.fromCharCode(65 + c)}${r + 1}`;

/** Parse a duration like "90", "90s", "3m", "1m30s" into milliseconds. */
export function parseDuration(input, fallbackMs) {
  const s = String(input || "").trim().toLowerCase();
  if (!s) return fallbackMs;
  if (/^\d+$/.test(s)) return Number(s) * 1000;
  const m = s.match(/^(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m || (!m[1] && !m[2])) return fallbackMs;
  return (Number(m[1] || 0) * 60 + Number(m[2] || 0)) * 1000;
}

export function formatDuration(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m ? `${m}m${String(s).padStart(2, "0")}s` : `${s}s`;
}

/** Strip a leading "@" from a nick argument. */
export const cleanNick = (n) => String(n || "").replace(/^@/, "").trim();
