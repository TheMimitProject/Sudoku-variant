# Writing a game

A game is one plain object. The `meshgame` session (`src/engine/meshgame.js`) does the rest: joining, leaving,
scores, cooldowns, timers, late-join sync, `/who`, `/help` and `/score`. The browser simulator and the host CLI both
run your module unchanged.

## The smallest useful game

```js
// src/games/highcard.js
export default {
  id: "highcard",
  name: "High Card",
  channel: "#cards",
  summary: "everyone draws, highest card wins the round",
  minPlayers: 2,
  maxPlayers: 8,

  create(ctx, options) {
    return { draws: {} };              // your state, any shape
  },

  start(ctx, state) {
    ctx.say("HIGH CARD · /draw");      // posted when the session starts
  },

  commands: [
    {
      name: "draw",
      usage: "draw",
      desc: "draw a card",
      run(ctx, state, nick) {
        if (state.draws[nick]) return ctx.dm(nick, "you already drew");
        state.draws[nick] = 1 + ctx.rng.int(13);
        ctx.say(`${nick} drew ${state.draws[nick]}`);
        if (Object.keys(state.draws).length === ctx.players().length) {
          const [winner] = Object.entries(state.draws).sort((a, b) => b[1] - a[1])[0];
          ctx.score(winner, 1);
          ctx.end([`🏆 ${winner} wins`]);
        }
      },
    },
  ],

  bot(ctx, state, nick) {
    return state.draws[nick] ? null : "/draw";   // what a simulated player would type
  },
};
```

Register it in `src/catalog.js` and it appears in `npm run host -- list` and the browser console.

## The `ctx` you get

| | |
| --- | --- |
| `ctx.say(text)` / `ctx.sayLines([...])` | post to the channel (`>>>` lines) |
| `ctx.dm(nick, text)` / `ctx.dmLines` | private message |
| `ctx.score(nick, delta)` / `ctx.getScore(nick)` / `ctx.standings()` / `ctx.scoreLines()` | scores |
| `ctx.cooldown(nick, ms)` / `ctx.cooling(nick)` | the session rejects that player's commands until it expires |
| `ctx.after(ms, fn)` / `ctx.clearTimers()` | timers (driven by `session.tick`) |
| `ctx.players()` | active nicks |
| `ctx.rng` | seeded RNG: `rng()`, `.int(n)`, `.pick(arr)`, `.shuffle(arr)`, `.chance(p)` |
| `ctx.now` | the session clock in ms |
| `ctx.end(lines)` | finish the game and post the summary |

## Optional hooks

| Hook | Use |
| --- | --- |
| `onJoin(ctx, state, nick, rejoined)` / `onLeave` | seat players, deal hands |
| `onChat(ctx, state, nick, text)` | plain messages that aren't commands (e.g. `JAM:nick`) |
| `snapshot(ctx, state, nick)` | lines DM'd on join and on `/sync` — keep it to one or two |
| `tick(ctx, state)` | runs on every clock tick |
| `view(state, nick)` | data for a custom UI; return `{ lines: [...] }` to get a live board in the console |

## Command options

```js
{ name: "sudo play", aliases: ["play", "p"], usage: "sudo play R3C5=7", desc: "…",
  readOnly: true,   // allowed during cooldowns and after the game ends
  private: true,    // sent to the host by DM; the simulator hides bots' private moves
  hidden: true,     // left out of /help
  noJoin: true,     // don't auto-join the sender
  run(ctx, state, nick, args, rawText) {} }
```

Multi-word names (`"sudo play"`) are matched longest-first.

## Checklist

- [ ] Every message under ~200 bytes; sync is one or two lines
- [ ] Fun with 3–10 s of latency; turn-based or claim-based beats real-time
- [ ] Works when players join late or drop out
- [ ] No secrets that need a trusted host — or use `src/engine/commit.js` so they can be checked afterwards
- [ ] A `bot()` so the simulator and `--bots` practice mode work
- [ ] A test in `tests/` (the "runs with bots without crashing" test picks up catalog entries automatically)
- [ ] A section in `docs/GAMES.md`
