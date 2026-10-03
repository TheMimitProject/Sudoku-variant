// meshgame — the shared host library.
//
// A game is a plain object of rules (see docs/WRITING-A-GAME.md). The session
// handles everything games have in common: players joining and leaving,
// scores, cooldowns, timers, late-join sync, /who, /help and /score.
// The same session drives the browser simulators and the meshhost CLI, so
// what you play in the browser is exactly what the CLI hosts over bitchat.

import { createRng } from "./rng.js";
import { tokenize, formatDuration } from "./commands.js";

/**
 * @param {object} game     rules module
 * @param {object} [opts]
 * @param {number|string} [opts.seed]
 * @param {object} [opts.options]  game-specific options (difficulty, mode, …)
 * @param {number} [opts.now]      starting clock in ms (tests pass a fake clock)
 */
export function createSession(game, opts = {}) {
  const rng = createRng(opts.seed ?? Date.now());
  const players = new Map(); // nick -> { score, cooldownUntil, active, joinedAt }
  const timers = [];
  let outbox = [];
  let now = opts.now ?? 0;
  let ended = false;
  let endLines = null;

  const ensure = (nick) => {
    if (!players.has(nick)) {
      players.set(nick, { score: 0, cooldownUntil: 0, active: true, joinedAt: now });
    }
    return players.get(nick);
  };

  const ctx = {
    rng,
    game,
    get now() {
      return now;
    },
    get ended() {
      return ended;
    },
    say: (text) => outbox.push({ to: "*", text: String(text) }),
    dm: (nick, text) => outbox.push({ to: nick, text: String(text) }),
    sayLines: (lines) => lines.forEach((l) => outbox.push({ to: "*", text: String(l) })),
    dmLines: (nick, lines) => lines.forEach((l) => outbox.push({ to: nick, text: String(l) })),
    score: (nick, delta) => {
      const p = ensure(nick);
      p.score += delta;
      return p.score;
    },
    getScore: (nick) => players.get(nick)?.score ?? 0,
    cooldown: (nick, ms) => {
      ensure(nick).cooldownUntil = now + ms;
    },
    cooling: (nick) => (players.get(nick)?.cooldownUntil ?? 0) > now,
    players: () => [...players.entries()].filter(([, p]) => p.active).map(([n]) => n),
    allPlayers: () => [...players.keys()],
    isPlayer: (nick) => !!players.get(nick)?.active,
    after: (ms, fn) => timers.push({ at: now + ms, fn }),
    clearTimers: () => (timers.length = 0),
    standings: () =>
      [...players.entries()]
        .map(([nick, p]) => ({ nick, score: p.score }))
        .sort((a, b) => b.score - a.score || a.nick.localeCompare(b.nick)),
    end: (lines = []) => {
      if (ended) return;
      ended = true;
      timers.length = 0;
      endLines = lines;
      ctx.say("━━━━━━━━━━━━━━━━━━━━━━━━");
      lines.forEach((l) => ctx.say(l));
      ctx.say("━━━━━━━━━━━━━━━━━━━━━━━━");
    },
  };

  const state = game.create(ctx, opts.options || {});

  const flush = () => {
    const out = outbox;
    outbox = [];
    return out;
  };

  const commandTable = game.commands || [];

  function findCommand(words) {
    // Longest prefix wins: "sudo play" before "sudo".
    for (let n = Math.min(3, words.length); n >= 1; n--) {
      const key = words.slice(0, n).join(" ").toLowerCase();
      const cmd = commandTable.find((c) => c.name === key || (c.aliases || []).includes(key));
      if (cmd) return { cmd, args: words.slice(n) };
    }
    return null;
  }

  function helpLines() {
    return [
      `${game.name} — ${game.summary || ""}`.trim(),
      ...commandTable.filter((c) => !c.hidden).map((c) => `  /${c.usage || c.name}  ${c.desc || ""}`),
      "  /who  /score  /sync  /help",
    ];
  }

  const session = {
    game,
    state,
    ctx,
    get now() {
      return now;
    },
    get ended() {
      return ended;
    },
    get endLines() {
      return endLines;
    },
    players: () => ctx.players(),
    standings: () => ctx.standings(),
    playerInfo: (nick) => players.get(nick),

    /** Advance the clock and run any due timers. */
    tick(at = now) {
      now = Math.max(now, at);
      let ran = true;
      while (ran) {
        ran = false;
        timers.sort((a, b) => a.at - b.at);
        if (timers.length && timers[0].at <= now && !ended) {
          const t = timers.shift();
          t.fn();
          ran = true;
        }
      }
      game.tick?.(ctx, state);
      return flush();
    },

    join(nick, at = now) {
      now = Math.max(now, at);
      const existed = players.has(nick);
      const p = ensure(nick);
      p.active = true;
      ctx.say(existed ? `${nick} reconnected` : `${nick} joined ${game.channel || "#mesh"}`);
      game.onJoin?.(ctx, state, nick, existed);
      if (game.snapshot && !ended) ctx.dmLines(nick, game.snapshot(ctx, state, nick));
      return flush();
    },

    leave(nick, at = now) {
      now = Math.max(now, at);
      const p = players.get(nick);
      if (p) {
        p.active = false;
        ctx.say(`${nick} left the mesh`);
        game.onLeave?.(ctx, state, nick);
      }
      return flush();
    },

    /** Feed one incoming chat message. Returns the host's replies. */
    receive(nick, text, at = now) {
      now = Math.max(now, at);
      const pre = this.tick(now);
      const words = tokenize(text);
      if (!words) {
        game.onChat?.(ctx, state, nick, text);
        return pre.concat(flush());
      }
      const head = (words[0] || "").toLowerCase();

      if (head === "join") return pre.concat(this.join(nick, now));
      if (head === "leave" || head === "quit") return pre.concat(this.leave(nick, now));
      if (head === "who") {
        ctx.say(`/who → ${ctx.players().length} nodes: ${ctx.players().join(", ")}`);
        return pre.concat(flush());
      }
      if (head === "help") {
        ctx.dmLines(nick, helpLines());
        return pre.concat(flush());
      }
      if (head === "sync" && game.snapshot) {
        ctx.dmLines(nick, game.snapshot(ctx, state, nick));
        return pre.concat(flush());
      }

      const found = findCommand(words);
      if (!found) {
        if (head === "score" || words.join(" ").toLowerCase().endsWith(" score")) {
          ctx.sayLines(scoreLines());
          return pre.concat(flush());
        }
        return pre.concat(flush()); // unknown commands are ignored, like on a real channel
      }
      const { cmd, args } = found;

      if (ended && !cmd.readOnly) {
        ctx.dm(nick, "Game over. Start a new one to keep playing.");
        return pre.concat(flush());
      }
      if (!cmd.noJoin && !players.get(nick)?.active) {
        // Auto-join on first command: on a mesh, people forget /join.
        pre.push(...this.join(nick, now));
      }
      if (!cmd.readOnly && ctx.cooling(nick)) {
        const left = players.get(nick).cooldownUntil - now;
        ctx.dm(nick, `cooldown: wait ${formatDuration(left)}`);
        return pre.concat(flush());
      }
      cmd.run(ctx, state, nick, args, text);
      return pre.concat(flush());
    },

    /** Ask the game's bot logic for a move on behalf of `nick`. */
    botMove(nick) {
      if (ended || !game.bot) return null;
      return game.bot(ctx, state, nick);
    },

    /** True when a message is a private action (sent to the host by DM, not the channel). */
    isPrivate(text) {
      const words = tokenize(text);
      return !!(words && findCommand(words)?.cmd.private);
    },

    view(nick) {
      return game.view ? game.view(state, nick, ctx) : null;
    },

    help: helpLines,
  };

  function scoreLines() {
    const s = ctx.standings();
    if (!s.length) return ["no players yet"];
    return ["SCORES", ...s.map((p, i) => `${i + 1}. ${p.nick} ${p.score}`)];
  }
  ctx.scoreLines = scoreLines;

  // Let the game announce itself.
  game.start?.(ctx, state);
  session.intro = flush();
  return session;
}

/** Render an output record the way it should be typed into bitchat. */
export function renderOutput(o) {
  return o.to === "*" ? `>>> ${o.text}` : `/msg ${o.to} ${o.text}`;
}
