// React wrapper around a meshgame session: one session per game, one bot loop
// per session (kept in refs so claims and re-renders don't restart it), and a
// chat log showing what "you" would see on the channel.

import { useCallback, useEffect, useRef, useState } from "react";
import { createSession } from "../engine/meshgame.js";

export const ME = "you";
export const BOT_NAMES = ["ghostnode", "rf_witch", "blewalker", "meshpunk", "zerohop", "nostr_kid", "staticnoise"];

let lineId = 0;

/**
 * @param {object} game     rules module
 * @param {object} options  game options
 * @param {object} cfg      { bots: number, botDelay: [min,max] ms, showBotDMs: bool }
 */
export function useMeshSession(game, options, cfg = {}) {
  const { bots = 3, botDelay = [1800, 4200] } = cfg;
  const [, setVersion] = useState(0);
  const [log, setLog] = useState([]);
  const sessionRef = useRef(null);
  const botsRef = useRef([]);
  const nextAtRef = useRef({});
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [gen, setGen] = useState(0);

  const bump = () => setVersion((v) => v + 1);

  const append = useCallback((entries) => {
    if (!entries.length) return;
    setLog((prev) => [...prev, ...entries].slice(-300));
  }, []);

  /** Keep broadcasts and DMs addressed to you; DMs to bots stay private. */
  const record = useCallback(
    (outs) => {
      append(
        outs
          .filter((o) => o.to === "*" || o.to === ME)
          .map((o) => ({ id: ++lineId, kind: o.to === "*" ? "host" : "dm", text: o.text }))
      );
    },
    [append]
  );

  const key = `${game.id}:${JSON.stringify(options)}:${bots}`;

  const reset = useCallback(() => {
    const now = Date.now();
    const s = createSession(game, { options, now });
    s.key = key;
    sessionRef.current = s;
    const names = BOT_NAMES.slice(0, bots);
    botsRef.current = names;
    nextAtRef.current = Object.fromEntries(names.map((n, k) => [n, now + 1500 + k * 700]));
    setLog([]);
    lineId = 0;
    record(s.intro);
    record(s.join(ME, now));
    names.forEach((n) => record(s.join(n, now)));
    setGen((g) => g + 1);
    bump();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, record]);

  useEffect(() => {
    reset();
  }, [reset]);

  const send = useCallback(
    (text) => {
      const s = sessionRef.current;
      const t = String(text || "").trim();
      if (!s || !t) return;
      append([{ id: ++lineId, kind: s.isPrivate(t) ? "mine-private" : "mine", nick: ME, text: t }]);
      record(s.receive(ME, t, Date.now()));
      bump();
    },
    [append, record]
  );

  // One loop per session generation. It reads everything through refs.
  useEffect(() => {
    let ticks = 0;
    const iv = setInterval(() => {
      const s = sessionRef.current;
      if (!s) return;
      const now = Date.now();
      const outs = s.tick(now);
      let changed = outs.length > 0;
      record(outs);
      if (!pausedRef.current && !s.ended) {
        for (const b of botsRef.current) {
          if (now < (nextAtRef.current[b] ?? 0)) continue;
          nextAtRef.current[b] = now + botDelay[0] + Math.random() * (botDelay[1] - botDelay[0]);
          const mv = s.botMove(b);
          if (!mv) continue;
          if (!s.isPrivate(mv)) append([{ id: ++lineId, kind: "chat", nick: b, text: mv }]);
          record(s.receive(b, mv, now));
          changed = true;
        }
      }
      // Re-render twice a second anyway so countdowns and cooldowns stay live.
      if (changed || (ticks++ & 1) === 0) bump();
    }, 250);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gen]);

  const togglePause = () => {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
  };

  // While switching games, the old session is still around for one render; never hand it out.
  const s = sessionRef.current?.key === key ? sessionRef.current : null;
  return {
    session: s,
    view: s ? s.view(ME) : null,
    log,
    send,
    reset,
    paused,
    togglePause,
    bots: botsRef.current,
    cooldownLeft: s ? Math.max(0, (s.playerInfo(ME)?.cooldownUntil ?? 0) - Date.now()) : 0,
  };
}
