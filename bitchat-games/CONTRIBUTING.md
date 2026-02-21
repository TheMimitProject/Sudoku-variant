# Contributing to bitchat-games

Thanks for wanting to add a game! Here's how.

## Adding a New Game

### 1. Design for bitchat's constraints

Your game must work within these limits:

- **Text-only messages** — no images, no rich media
- **< 200 bytes per message** — BLE packets are small
- **3–10 second latency** — multi-hop mesh is slow
- **No persistent server** — a human host or simple script moderates
- **2–8 players** with graceful join/leave between rounds
- **Uses existing bitchat commands** — `/msg`, `/join`, `/who`, public channel chat

### 2. Write the protocol spec

Create `docs/PROTOCOL-YOURGAME.md` documenting:

- Overview (players, time, win condition)
- Complete game flow
- All message formats with examples
- Payload size estimates
- Strategy tips

### 3. Build the simulator

Create `src/games/YourGame.jsx`:

- React component with default export
- Two tabs: rules/design doc + playable simulator
- Simulated bot opponents
- Terminal/mesh aesthetic consistent with existing games
- Uses Tailwind CSS for styling

### 4. Register in App.jsx

Add your game to the `GAMES` array in `src/components/App.jsx`.

### 5. Update README

Add your game to the Games section in `README.md`.

## Development

```bash
npm install
npm run dev
```

## Code Style

- Functional React components with hooks
- No external game logic libraries — write engines from scratch
- Tailwind for styling — maintain the terminal/mesh aesthetic
- Keep components self-contained in single files

## Game Design Checklist

- [ ] Playable entirely via text < 200 bytes per message
- [ ] Handles 2–8 players with graceful join/leave
- [ ] Fun even with 3–10 second message latency
- [ ] No persistent server or internet required
- [ ] Protocol spec in `docs/`
- [ ] Browser simulator in `src/games/`
- [ ] Added to App.jsx game selector
- [ ] README updated
