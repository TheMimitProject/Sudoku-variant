# Other games and tools — protocols

All of these run through the same host (`npm run host -- <id>`) and the same simulator console.

---

## Mesh Battleship — `battleship` · `#battleship` · 2 players

- 8×8 board, columns A–H, rows 1–8. Fleet: 4, 3, 3, 2.
- `/fleet auto` or `/fleet A1h4,C3v3,E5h3,H1v2` (top-left cell, `h`/`v`, length).
  The host replies privately with your layout and a salt, and posts `fleet committed: ann 77896784a09a0249`.
- Battle: `/fire B7` on your turn. `💥 hit`, `— sunk a 3!`, or `🌊 miss`.
- When a fleet is sunk, both layouts and salts are revealed. Every client checks
  `sha256(salt:layout)` against the commitment **and** every hit/miss answer against the revealed fleet:
  `ghostnode: commitment ✓ · answers ✗ LIED`.
- Hostless: each player's own client answers shots against its own fleet; the end-of-game audit keeps them honest.

## Minesweeper Co-op — `minesweeper` · `#mines` · 1–8 players

- Easy 8×8/8 mines, medium 9×9/12, hard 10×10/18. Three lives.
- `/dig C4`, `/flag C4`, `/unflag C4`, `/mines`.
- **One action per turn:** you can't act twice in a row while others are playing.
- The first dig is always safe (mines are laid after it, avoiding its neighbours).
- Digging a mine costs a life (−2 points for the digger). Openings score +1 per cell opened.
- Win: every safe cell open. Wrong flags are counted in the result. The board is re-posted every 4 actions.

Board legend: `#` hidden · `F` flag · ` ` empty · digit = neighbouring mines · `*` mine · `X` wrong flag (end only).

## Nonogram Race — `nonogram` · `#nono` · 1–8 players

- 5×5, 8×8 or 10×10. Row clues on the left, column clues on top.
- `/nono fill R3C5` (+1 if that cell is filled), `/nono x R3C5` (mark empty, no points).
- Wrong: −1 and a 3 s cooldown. Ends when every filled cell is found.
- Every puzzle is accepted only if a line-by-line solver finishes it, which guarantees one solution.

## Word Grid — `wordgrid` · `#words` · 1–12 players

- 4×4 grid rolled from classic Boggle dice. `Qu` is one tile.
- `/word STREAM`: 3+ letters, adjacent cells (diagonals count), no tile reused, must be in the dictionary
  (115k words, 3–8 letters, from `an-array-of-english-words`).
- Live, the channel only sees `ann found a 5-letter word (4 total)`.
- At time (90 s / 3 min / 5 min), words are revealed. **Words found by two or more players cancel.**
- Points: 3–4 letters 1 · 5 → 2 · 6 → 3 · 7 → 5 · 8 → 11. The longest missed words are listed for fun.

---

## Mesh Poll — `poll` · `#mesh`

- `/poll new [5m] Where do we regroup? | north gate | food court` — the optional duration auto-closes it.
- `/poll vote 2` (latest poll) or `/poll vote 1 2` (poll #1, option 2). One vote per person; you can change it.
- `/poll results [#id]`, `/poll close [#id]` (creator only).

## Check-in Board — `checkin` · `#checkin`

- `/safe [note]`, `/sos <where/what>`, `/enroute [eta]`.
- `/omw <nick>` tells someone who asked for help that you're coming.
- `/expect sam jo …` adds people you're waiting to hear from; they show as "no word".
- `/roster` lists help first, then no word, en route and safe, each with "last heard" time.
- `/report water|food|shelter|medical|power|signal|blocked|fire|flood|hazard [@location] [note]`, `/reports`.
- Put `/up` in front of any of these to upload it to the web map — see [PROTOCOL-UPLINK.md](PROTOCOL-UPLINK.md).
  `/up contact <npub>` sends your exact location privately to someone whenever you upload.

## Scavenger Hunt — `scavenger` · `#hunt`

- The host loads clues: `npm run host -- scavenger --hunt examples/hunt.json` (`[{ clue, code, hint }]`).
- Put each code word on a card at its spot. Players walk there and send `/found CODE`.
- Each player progresses separately; their next clue arrives by DM.
- `/hint` adds 1 minute. A wrong code costs a 10 s cooldown. `/standings` ranks progress and time.
- Bluetooth range is the proof: you have to be near the card to read it.
- Host `/up standings` uploads names and times (no locations).

## Mesh Ping Test — `pingtest` · `#ping`

- Host: `/probe start 10` posts `PING 01` … `PING 10`, one every 3 s.
- Everyone: `/pong 1-4,6` with the numbers that reached them, optionally `hops 3` if your app shows it.
- `/probe report`: per node, % received and median reply time, graded 🟢 ≤10% loss · 🟡 ≤35% · 🔴 worse.
- Reply time is measured when the host types your `/pong` into meshhost, so it includes the human in the loop.
- Add `@location` to a `/pong` and the host can `/up probe` to put each node's result on the web map as a coverage
  pin.
