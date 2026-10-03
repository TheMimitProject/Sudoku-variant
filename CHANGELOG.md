# Changelog

## 0.2.0 — 2026-10-03

A rebuild around a shared rules engine, so the simulators and real mesh play run the same code.

### Fixed
- **Stray folders.** The old archive contained directories literally named `{src` and `{src/games,src` from a failed
  brace expansion, and no `public/` folder.
- **Missing screenshot.** The README linked `docs/screenshot-sudoku.png`, which didn't exist. It's a real one now.
- **Mesh Hunt chat lost focus on every keystroke.** Tabs were components defined inside the main component, so React
  remounted them each render. The UI is now built from stable top-level components.
- **Mesh Sudoku could end early.** A wrong guess sat in the claims map and could make a full-looking board count as
  finished. Wrong guesses are no longer written to the board (covered by a test).
- **Sudoku bot timer kept resetting.** The interval was rebuilt on every claim. There is now one bot loop per session,
  driven by refs.
- **Mesh Hunt votes didn't match.** Bot votes shown in chat were rolled separately from the ones counted. There is now a
  single vote record, and the tally line lists the counts.
- **Mesh Hunt stuck after you were voted out.** Disconnected players become spectators and the game continues.
- **Mesh Hunt win rule.** Jammers now win when they equal or outnumber everyone else (was "Signals ≤ 1").
- **Non-unique puzzles.** The generator removed cells at random, so hard puzzles could have several answers. Every
  puzzle is now checked for a unique solution.

### Added
- **Shared engine** (`src/engine/`): `meshgame` session (players, scores, cooldowns, timers, late-join sync), seeded RNG,
  SHA-256, commit-reveal, command parsers.
- **Sudoku modes:** Territory, Blind (co-op), Relay (teams), Mini 6×6, Daily Mesh Puzzle with proof hashes.
- **81-character board code** used by the simulator and the protocol (`a–z` = claimed by player).
- **Puzzle ids** (`9.medium.482913`) and offline verification for hostless play.
- **Games:** Mesh Battleship (commit-reveal), Minesweeper Co-op, Nonogram Race, Word Grid.
- **Tools:** Mesh Poll, Check-in Board, Scavenger Hunt, Mesh Ping Test.
- **`meshhost` CLI** to host any game or tool over a real bitchat channel, with `--bots` practice mode, transcript
  replay, `verify` and `daily-verify`.
- Mesh Hunt: Booster and Scanner roles at 7+, relay checks, "jammed twice drops off", phase timers.
- Tests (vitest), CI, and GitHub Pages deployment.
- Mesh Sudoku is now the main page.

## 0.1.0

Initial Mesh Hunt and Mesh Sudoku simulators.
