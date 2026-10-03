// Key helpers that don't open any network connections (safe to use in rules modules).

import { nip19 } from "nostr-tools";

/** Accepts npub1… or 64-char hex. Returns lowercase hex or null. */
export function parsePubkey(input) {
  const s = String(input || "").trim();
  if (/^[0-9a-f]{64}$/i.test(s)) return s.toLowerCase();
  try {
    const d = nip19.decode(s);
    return d.type === "npub" ? d.data : null;
  } catch {
    return null;
  }
}

export const npub = (hex) => nip19.npubEncode(hex);
export const nsec = (sk) => nip19.nsecEncode(sk);
