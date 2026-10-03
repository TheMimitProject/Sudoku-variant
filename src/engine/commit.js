// Commit-reveal: publish a short hash now, reveal the secret later.
// Anyone on the mesh can check the reveal matches the commitment, so
// nobody has to trust a host to keep secrets honest.

import { sha256 } from "./sha256.js";

/** Short hashes keep messages small; 16 hex chars = 64 bits, plenty for a game. */
export const COMMIT_LEN = 16;

export function makeSalt(rng) {
  let s = "";
  for (let i = 0; i < 8; i++) s += Math.floor(rng() * 36).toString(36);
  return s;
}

export function commit(secret, salt) {
  return sha256(`${salt}:${secret}`).slice(0, COMMIT_LEN);
}

export function verify(commitment, secret, salt) {
  return commit(secret, salt) === commitment;
}
