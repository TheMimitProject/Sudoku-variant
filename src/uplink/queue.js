// Store-and-forward queue. A gateway keeps records here while it has no
// signal and drains the queue the moment it reaches a relay. Records survive
// restarts (the CLI saves the queue to disk) and are dropped once expired.

import { expiresAt } from "./records.js";

export class UplinkQueue {
  constructor(items = []) {
    this.items = items;
  }

  static fromJSON(json) {
    try {
      const data = typeof json === "string" ? JSON.parse(json) : json;
      return new UplinkQueue(Array.isArray(data?.items) ? data.items : []);
    } catch {
      return new UplinkQueue();
    }
  }

  toJSON() {
    return { v: 1, items: this.items };
  }

  has(id) {
    return this.items.some((it) => it.record.id === id);
  }

  /** Add a record. Returns false for duplicates (another copy already queued). */
  add(record, extra = {}, now = Math.floor(Date.now() / 1000)) {
    if (this.has(record.id)) return false;
    this.items.push({ record, status: "pending", tries: 0, sentTo: [], addedAt: now, ...extra });
    return true;
  }

  pending(now = Math.floor(Date.now() / 1000)) {
    return this.items.filter((it) => it.status === "pending" && expiresAt(it.record) > now);
  }

  markSent(id, relays) {
    const it = this.items.find((x) => x.record.id === id);
    if (it) {
      it.status = "sent";
      it.sentTo = [...new Set([...it.sentTo, ...relays])];
    }
  }

  markFailed(id, now = Math.floor(Date.now() / 1000)) {
    const it = this.items.find((x) => x.record.id === id);
    if (it) {
      it.tries++;
      it.lastTry = now;
    }
  }

  /** Drop expired records. */
  prune(now = Math.floor(Date.now() / 1000)) {
    const before = this.items.length;
    this.items = this.items.filter((it) => expiresAt(it.record) > now);
    return before - this.items.length;
  }

  stats(now = Math.floor(Date.now() / 1000)) {
    const pending = this.pending(now).length;
    const sent = this.items.filter((it) => it.status === "sent").length;
    return { pending, sent, total: this.items.length };
  }
}
