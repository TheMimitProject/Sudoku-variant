// Gateway: takes records the mesh marked with /up, keeps them in the
// store-and-forward queue, and publishes them whenever it can reach a relay.
// Network and disk access are passed in, so the same logic runs in the CLI,
// the browser simulator and the tests.

import { UplinkQueue } from "./queue.js";
import { TYPES } from "./records.js";
import { shortId } from "./mesh.js";

/**
 * @param {object} o
 * @param {UplinkQueue} [o.queue]
 * @param {(item) => Promise<{ok: string[], failed: object[]}>} o.publish  sends one queue item
 * @param {() => void} [o.save]       persist the queue
 * @param {(line: string) => void} [o.log]
 * @param {boolean} [o.drill]         mark everything as a drill (filtered out of the public map by default)
 * @param {string} [o.label]          "live", "dry run", "simulated"…
 */
export function createGateway({ queue = new UplinkQueue(), publish, save = () => {}, log = () => {}, drill = false, label = "live" }) {
  let online = true; // "online" here means "allowed to try"; a failed publish just leaves items queued
  let running = null; // the flush in progress, if any
  let again = false; // something new arrived while flushing
  const nowS = () => Math.floor(Date.now() / 1000);

  async function flushOnce() {
    let sent = 0, failed = 0;
    try {
      queue.prune(nowS());
      for (const item of queue.pending(nowS())) {
        try {
          const res = await publish(item);
          if (res.ok.length) {
            queue.markSent(item.record.id, res.ok);
            sent++;
            log(`✓ published ${TYPES[item.record.type]?.label || item.record.type} ${shortId(item.record.id)} → ${res.ok.length} relay${res.ok.length > 1 ? "s" : ""}${item.contacts?.length && item.exactGeo ? ` + ${item.contacts.length} private DM` : ""}`);
          } else {
            queue.markFailed(item.record.id, nowS());
            failed++;
          }
        } catch (err) {
          queue.markFailed(item.record.id, nowS());
          failed++;
          log(`✗ publish failed for ${shortId(item.record.id)}: ${err.message || err}`);
        }
      }
      if (failed) log(`gateway: ${failed} record${failed > 1 ? "s" : ""} still waiting — no relay reachable, will retry`);
    } finally {
      save();
    }
    return { sent, failed };
  }

  const gw = {
    queue,
    get online() {
      return online;
    },
    setOnline(v) {
      online = !!v;
      log(online ? "gateway: online — will publish queued records" : "gateway: holding records (offline)");
    },

    /** Take items drained from a session. */
    accept(items) {
      let added = 0;
      for (const it of items) {
        const record = drill ? { ...it.record, drill: true } : it.record;
        if (queue.add(record, { exactGeo: it.exactGeo, contacts: it.contacts || [] }, nowS())) {
          added++;
          log(`queued ${TYPES[record.type]?.label || record.type} ${shortId(record.id)}${record.drill ? " (drill)" : ""}`);
        }
      }
      if (added) save();
      return added;
    },

    /** Try to publish everything pending. Safe to call often: overlapping calls coalesce. */
    flush() {
      if (!online) return Promise.resolve({ sent: 0, failed: 0 });
      if (running) {
        again = true;
        return running;
      }
      running = (async () => {
        const total = { sent: 0, failed: 0 };
        do {
          again = false;
          const r = await flushOnce();
          total.sent += r.sent;
          total.failed = r.failed;
        } while (again && online);
        running = null;
        return total;
      })();
      return running;
    },

    status() {
      const s = queue.stats(nowS());
      return `gateway (${label}${drill ? ", drill" : ""}) ${online ? "online" : "holding"} · ${s.pending} waiting · ${s.sent} published`;
    },
  };
  return gw;
}
