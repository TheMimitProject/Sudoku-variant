# Contributing

New games, variants and tools are welcome.

1. Read [docs/WRITING-A-GAME.md](docs/WRITING-A-GAME.md). A game is one rules file in `src/games/` (or `src/tools/`).
2. Register it in `src/catalog.js` with its options and a bot count.
3. Add tests in `tests/`. The catalog-wide "runs with bots" test covers the basics automatically.
4. Document the protocol in `docs/GAMES.md` (or its own `docs/PROTOCOL-*.md` if it's big).
5. `npm test && npm run build`, then open a pull request.

## Design rules for the mesh

- Text only, every message under ~200 bytes.
- Fun with 3–10 seconds of latency.
- Late joiners and dropouts don't break the game.
- No trusted server. If a host has to keep secrets, make them verifiable afterwards (`src/engine/commit.js`).
- Use plain bitchat features: channels, `/msg`, `/who`.

## Code style

- Rules modules are plain JavaScript with no React or Node imports, so they run in both the browser and the CLI.
- UI components live in `src/web/` and are top-level components (never defined inside another component).
- Keep messages short and neutral (`✓ ghostnode: R3C5=7`) — nick `you` should read naturally too.
