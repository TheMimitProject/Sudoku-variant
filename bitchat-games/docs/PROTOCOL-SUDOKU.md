# Mesh Sudoku — Bitchat Protocol Spec

> Competitive cell-claiming Sudoku over Bluetooth mesh.

## Overview

- **Players:** 2–6
- **Channel:** `#sudoku`
- **Win condition:** Most claimed cells when the puzzle is complete
- **Average game:** 10–20 minutes
- **Difficulty levels:** Easy (38 clues), Medium (32 clues), Hard (26 clues)

## Concept

A Sudoku puzzle is broadcast to all players on the mesh. Players race to solve cells — each correct answer **claims** that cell and earns a point. Wrong guesses cost a point and trigger a cooldown. The player with the most claimed cells when the board is complete wins.

## Game Flow

### 1. Setup

One player volunteers as **host**. Players join:

```
/join #sudoku
```

Host generates a puzzle and announces difficulty:

```
>>> MESH SUDOKU · difficulty: medium · 49 cells to claim
```

### 2. Board Broadcast

Host broadcasts the initial board in compact text format:

```
>>> BOARD
5 3 . | . 7 . | . . .
6 . . | 1 9 5 | . . .
. 9 8 | . . . | . 6 .
------+-------+------
8 . . | . 6 . | . . 3
4 . . | 8 . 3 | . . 1
7 . . | . 2 . | . . 6
------+-------+------
. 6 . | . . . | 2 8 .
. . . | 4 1 9 | . . 5
. . . | . 8 . | . 7 9
```

This is ~180 bytes, within BLE limits. With LZ4 compression it's ~100–120 bytes.

### 3. Gameplay

Players solve cells by posting moves:

```
/sudo play R1C4=8
```

This means: place the number **8** at **row 1, column 4**.

Host validates and responds:

**Correct:**
```
>>> ✓ ghostnode claims R1C4 (+1)
```

**Wrong:**
```
>>> ✗ ghostnode wrong at R1C4 (-1, 3s cooldown)
```

### 4. Board Refresh

Host periodically re-broadcasts the current board state (every 5–10 moves, or on request):

```
/sudo show
```

```
>>> BOARD (14/49 claimed)
5 3 [4]| . 7 [8]| . [1] .
6 [7] .| 1 9 5 | . . .
...
```

Claimed cells are shown in brackets `[N]` with the claimer's initial.

### 5. Game End

When all cells are correctly filled:

```
>>> ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
>>> PUZZLE COMPLETE!
>>> 🏆 1st: ghostnode (18 cells)
>>> 🥈 2nd: you (15 cells)
>>> 🥉 3rd: rf_witch (11 cells)
>>>    4th: meshpunk (5 cells)
>>> ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Command Reference

| Command              | Context | Description                          |
| -------------------- | ------- | ------------------------------------ |
| `/join #sudoku`      | Public  | Join the game                        |
| `/sudo play R3C5=7`  | Public  | Place a number (row 3, col 5 = 7)   |
| `/sudo show`         | Public  | Request current board state          |
| `/sudo score`        | Public  | Show current scoreboard              |
| `/sudo check`        | Public  | Validate the board (host responds)   |
| `/who`               | Public  | List active players                  |

## Rules

1. **Correct placement:** +1 point. The cell is permanently claimed by that player.
2. **Wrong guess:** -1 point. The player enters a 3-second cooldown (honor system, or host tracks).
3. **Claimed cells:** Cannot be overwritten. First correct answer wins the cell.
4. **Ties:** If two players submit the same correct answer simultaneously, the first message to reach the host wins. BLE proximity is an advantage.
5. **Late joiners:** Can request `/sudo show` at any time to get the current board state.
6. **Disconnections:** A player who leaves can rejoin. Their previously claimed cells remain.

## Payload Sizes

| Message Type    | Example                    | Size     |
| --------------- | -------------------------- | -------- |
| Place move      | `/sudo play R3C5=7`       | ~20 bytes |
| Board broadcast | Full 9×9 grid             | ~180 bytes (raw), ~110 bytes (LZ4) |
| Score update    | `>>> ✓ ghostnode R3C5 (+1)` | ~30 bytes |
| Scoreboard      | 4-player scoreboard       | ~80 bytes |

All messages are well within bitchat's BLE payload limits.

## Compact Board Encoding (Optional)

For environments where every byte counts, the board can be encoded as an 81-character string:

```
53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79
```

Where `.` represents an empty cell. This is only 81 bytes and compresses to ~50 bytes with LZ4.

Claimed cells can be represented by lowercase letters (a–f for players 1–6):

```
53a.7b..c6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79
```

## Mesh Considerations

### Latency & Race Conditions

Two players might solve the same cell at nearly the same time. The host uses **first-message-received** ordering. This gives a slight advantage to players who are physically closer to the host on the mesh (fewer hops = less latency).

This is a feature, not a bug — it adds a spatial/physical dimension to the game that mirrors the real topology of the BLE mesh.

### Stale State

Players might be working from a slightly stale board if they missed a claim announcement. The periodic `/sudo show` re-sync solves this. Players should request a refresh if they suspect they missed updates.

### Host Reliability

If the host disconnects, any player with the solution can take over. The solution can be pre-shared with a backup host via `/msg`.

## Strategy Tips

- **Don't just race for easy cells.** Everyone sees the obvious naked singles. Target cells that require deeper logic — fewer competitors there.
- **Watch the chat.** If `ghostnode` just claimed three cells in box 7, they'll probably keep working that area. Hunt elsewhere.
- **Accuracy over speed.** A wrong guess costs -1 AND 3 seconds of cooldown. Two wrong guesses = losing 5 points of swing (2 lost + ~3 cells your opponents claim during cooldown).
- **Request board refreshes.** If you haven't seen a `/sudo show` in a while, ask for one. You might be solving cells that are already claimed.
- **On harder difficulties,** the solving advantage shifts from speed to skill. Easy cells disappear fast; the endgame is won by players who can crack the hard deductions.
