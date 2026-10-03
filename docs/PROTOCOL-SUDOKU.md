# Mesh Sudoku — protocol

Channel: `#sudoku` · Players: 1–12 · Host: optional (see *Hostless play*)

## Puzzles

- Sizes: **9×9** (3×3 boxes) and **Mini 6×6** (2×3 boxes).
- Difficulty is the number of givens: 9×9 easy 38 · medium 32 · hard 26; 6×6 easy 18 · medium 14 · hard 12.
- Every puzzle has **exactly one solution**. Cells are removed one at a time and a removal is kept only if the
  puzzle stays unique. (Very low targets may stop a clue or two above the target.)
- Every puzzle has an **id**: `<size>.<difficulty>.<seed>`, e.g. `9.medium.482913`. The generator is deterministic,
  so any device can rebuild the exact puzzle and its solution from the id.

## Commands

| Command | Who sees it | What it does |
| --- | --- | --- |
| `/sudo play R3C5=7` | channel | place 7 at row 3, column 5 (also accepts `r3c5 7`, `3,5=7`) |
| `/sudo show` | channel (co-op: DM) | full text board |
| `/sudo code` | channel | compact board code |
| `/sudo score` | channel | scores (co-op: cells left, passes, mistakes) |
| `/sudo check` | channel | validate the board |
| `/sudo seed` | channel | puzzle id for offline verification |
| `/sudo pass @nick R3C5` | channel + DM | co-op: send a given you know to a teammate |
| `/who` `/sync` `/help` | | players · re-send your sync · command list |

The first command from a new nick auto-joins them (people forget `/join` on a mesh).

## Modes

### Race
- Correct: the cell is claimed by you, **+1**.
- Wrong: **−1** and a **3 s cooldown**. Wrong guesses are never written to the board, so they can't end the game.
- A claimed cell can't be overwritten. Ties go to whichever message reached the host first; on a mesh, fewer hops wins.
- Game ends when every cell is filled. Most points wins.

### Territory
Race rules, plus: when a box fills, whoever claimed the most of its cells captures it for **+3**. Ties capture nothing.

### Blind (co-op)
- Everyone shares one board. The givens are dealt round-robin between players; unknown givens show as `?`.
- Placed cells are shared with everyone. Givens are not: trade them with `/sudo pass @nick R3C5`.
- Wrong placements count as team mistakes and trigger the cooldown.
- Result: time, passes used, mistakes. Fewer is better.
- Join before the first move: the deal is recomputed when someone joins.

### Relay (teams)
- Teams of 3 (`Team A`, `Team B`, …), each with its own copy of the board.
- Each player owns one **band** (3 rows on 9×9, 2 rows on 6×6), may only place in that band, and starts knowing only
  that band's givens.
- Teammates relay the givens you need with `/sudo pass`. Placements are announced without values
  (`✓ [Team A] rf_witch: R4C2`) and the value goes to teammates by DM, so other teams can't copy.
- First team to finish wins; the game ends when every team has finished.

### Mini
Any mode with `--size 6`.

## Board formats

**Text board** (`/sudo show`):

```
BOARD (medium, 49 left)
. . 2 | 5 6 4 | . 3 .
7 4 . | . . 2 | . . 5
5 . . | 8 . . | . 4 2
------+-------+------
…
```

**Board code** — one character per cell, row by row:

| char | meaning |
| --- | --- |
| `1`–`9` | given |
| `.` | empty |
| `a`–`z` | claimed by player #n in join order (`a` = first). The value is recoverable from the puzzle id. |

A 9×9 code is 81 characters, a Mini code 36. In race and territory the host posts `SYNC <code>` every 8 claims so
players who missed packets can catch up. In co-op, `/sync` sends `KNOWN <code>` with `?` for givens you don't know.

**Late-join sync** is two short DMs: the puzzle id and the board code. `/sudo show` sends the full grid on request.

## Hostless play

1. Agree on a puzzle id (`/sudo seed` from anyone who generated one, or pick a seed together).
2. Everyone can rebuild the puzzle from the id and check any move: `npm run host -- verify 9.medium.482913 R3C5=7`
   (or host locally with `npm run host -- sudoku --seed 482913 --difficulty medium`).
3. Moves are posted as usual. Each client checks them against its own copy; the first valid claim seen by the
   majority stands.

This is honour-system scoring — anyone could run the solver — but it needs no trusted host and no network.

## Daily Mesh Puzzle

- Seed: `daily:<YYYY-MM-DD>` (UTC), medium 9×9. Everyone in range gets the same puzzle.
- `/daily play R3C5=7` is checked **on your own device**; nothing is sent.
- `/daily done` posts: `ann solved daily 2026-10-03 in 7m42s · 1 mistakes · proof 1a2b3c4d5e6f7a8b`
- The proof is `sha256("<date>:<nick>:<solution>")` cut to 16 hex chars. It shows you had the right grid — check it
  with `/daily verify @ann <proof>` once you've solved it too, or `npm run host -- daily-verify ann <proof> --date 2026-10-03`.
- `/daily board` ranks posted times (each mistake adds 30 s).
- `/up daily` uploads your time and proof to the global leaderboard on the Uplink map, which re-checks every proof.

## Sizes on the wire

| Message | Size |
| --- | --- |
| move | ~18 bytes |
| host reply | ~30 bytes |
| board code | 81 / 36 chars |
| text board | 11 lines of ~21 chars |
