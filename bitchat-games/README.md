# bitchat-games

> Lightweight, text-first games designed for the [bitchat](https://github.com/permissionlesstech/bitchat) Bluetooth mesh network.

These games are built around bitchat's constraints: tiny BLE payloads, multi-hop latency, no central server, text-only messaging, and fluid player counts. Each game uses standard bitchat IRC-style commands (`/msg`, `/join`, `/who`) — no protocol changes required.

This repo contains **playable browser simulators** so you can try each game against bots, plus **protocol specs** documenting exactly how to play over a real bitchat mesh.

![Mesh Sudoku](docs/screenshot-sudoku.png)

---

## Games

### 🔴 Mesh Hunt

A social deduction game (Mafia/Werewolf for Bluetooth mesh). A **Jammer** has infiltrated the mesh and disrupts relay links each night. **Signal** nodes must debate and vote to disconnect the Jammer before the mesh collapses.

- **Players:** 4–8
- **Time:** 15–30 min
- **Message size:** ~20–80 bytes per action
- **Key commands:** `/msg meshbot JAM:<target>`, `/vote <target>`, `/who`

### 🟦 Mesh Sudoku

Competitive cell-claiming Sudoku. A puzzle is broadcast to all players. Race to solve cells — first correct answer claims it. Wrong guesses cost points and trigger cooldowns.

- **Players:** 2–6
- **Time:** 10–20 min
- **Message size:** ~25 bytes per move
- **Key commands:** `/sudo play R3C5=7`, `/sudo show`, `/sudo score`

---

## Quick Start

```bash
# Clone the repo
git clone https://github.com/yourusername/bitchat-games.git
cd bitchat-games

# Install dependencies
npm install

# Start dev server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Project Structure

```
bitchat-games/
├── public/
│   └── index.html
├── src/
│   ├── components/
│   │   └── App.jsx          # Main app with game selector
│   ├── games/
│   │   ├── MeshHunt.jsx     # Social deduction game
│   │   └── MeshSudoku.jsx   # Competitive sudoku
│   ├── main.jsx              # Entry point
│   └── index.css             # Global styles (Tailwind)
├── docs/
│   ├── PROTOCOL-MESHHUNT.md  # Bitchat protocol spec for Mesh Hunt
│   └── PROTOCOL-SUDOKU.md    # Bitchat protocol spec for Mesh Sudoku
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
└── README.md
```

---

## Playing on a Real Bitchat Mesh

These simulators demonstrate the games with bots, but the games are designed to be played **over actual bitchat**. Each game's protocol doc (in `docs/`) specifies the exact message format.

### Mesh Hunt — Real Mesh Setup

1. Players `/join #meshhunt`
2. One player volunteers as **host** (runs the game manually or with a script)
3. Host assigns roles via `/msg <player> ROLE:signal` or `ROLE:jammer`
4. Each night, the Jammer sends `/msg host JAM:<target>`
5. Host announces results on `#meshhunt`
6. Players discuss, then `/vote <target>` publicly
7. Host tallies votes and announces elimination

### Mesh Sudoku — Real Mesh Setup

1. Players `/join #sudoku`
2. Host generates a puzzle and broadcasts the board as a compact text grid
3. Players solve cells with `/sudo play R3C5=7`
4. Host validates and announces claims: `>>> ✓ ghostnode claims R3C5`
5. Host re-broadcasts board state periodically for late joiners
6. Game ends when all cells are filled; host announces final scores

### Board Format (Compact Text)

```
>>> BOARD (easy)
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

At ~180 bytes this fits comfortably within bitchat message limits (with LZ4 compression it's even smaller).

---

## Design Principles

1. **Text-only** — No images, no rich media. Everything is expressible as short text messages.
2. **Tiny payloads** — Every game action fits in a single BLE-friendly message (<200 bytes).
3. **Latency-tolerant** — Turn-based or async-compatible. Multi-hop delays are features, not bugs.
4. **Serverless** — A human host or simple script moderates. No persistent server needed.
5. **Fluid players** — Players can join/leave between rounds without breaking the game.
6. **Uses existing protocol** — Standard bitchat commands only. No custom extensions.

---

## Tech Stack (Simulators)

- **React 18** — Component framework
- **Vite** — Build tool
- **Tailwind CSS** — Styling
- **No external game libraries** — Sudoku engine, game logic all from scratch

---

## Contributing

Want to add a new game? Great! A good bitchat game should:

- [ ] Be playable entirely via text messages under 200 bytes
- [ ] Handle 2–8 players with graceful join/leave
- [ ] Be fun even with 3–10 second message latency
- [ ] Not require a persistent server or internet connection
- [ ] Include a protocol spec in `docs/`
- [ ] Include a browser simulator in `src/games/`

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

---

## License

MIT — see [LICENSE](LICENSE).

---

*Built for the mesh. No internet required.*
