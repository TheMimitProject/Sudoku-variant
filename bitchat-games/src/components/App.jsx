import { useState } from "react";
import MeshHunt from "../games/MeshHunt";
import MeshSudoku from "../games/MeshSudoku";

const GAMES = [
  {
    id: "meshhunt",
    name: "Mesh Hunt",
    icon: "🔴",
    tagline: "Social deduction on Bluetooth",
    players: "4–8",
    time: "15–30 min",
    component: MeshHunt,
  },
  {
    id: "meshsudoku",
    name: "Mesh Sudoku",
    icon: "🟦",
    tagline: "Competitive cell-claiming",
    players: "2–6",
    time: "10–20 min",
    component: MeshSudoku,
  },
];

export default function App() {
  const [activeGame, setActiveGame] = useState(null);

  if (activeGame) {
    const game = GAMES.find((g) => g.id === activeGame);
    const GameComponent = game.component;
    return (
      <div className="relative">
        <button
          onClick={() => setActiveGame(null)}
          className="fixed top-3 left-3 z-50 bg-black/60 border border-cyan-900/40 text-cyan-500 hover:text-cyan-300 hover:border-cyan-600/50 text-xs font-mono px-3 py-1.5 rounded transition-all backdrop-blur-sm"
        >
          ← all games
        </button>
        <GameComponent />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background:
          "linear-gradient(160deg, #030a0f 0%, #061218 40%, #0a1520 100%)",
      }}
    >
      {/* Scan lines */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.02]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,200,0.08) 2px, rgba(0,255,200,0.08) 4px)",
        }}
      />

      <div className="relative z-10 w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="text-xs tracking-[0.6em] text-cyan-700 uppercase mb-2">
            bluetooth mesh
          </div>
          <h1
            className="text-4xl font-black text-cyan-300 tracking-tight mb-2"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            bitchat games
          </h1>
          <p className="text-cyan-600/50 text-sm max-w-xs mx-auto leading-relaxed">
            Lightweight games designed for the bitchat BLE mesh. No internet
            required.
          </p>
        </div>

        {/* Game Cards */}
        <div className="space-y-3">
          {GAMES.map((game) => (
            <button
              key={game.id}
              onClick={() => setActiveGame(game.id)}
              className="w-full text-left bg-black/30 border border-cyan-900/25 rounded-lg p-5 hover:border-cyan-700/40 hover:bg-cyan-950/15 transition-all group"
            >
              <div className="flex items-start gap-4">
                <div className="text-2xl mt-0.5">{game.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-lg font-bold text-cyan-300 group-hover:text-cyan-200 transition-colors">
                      {game.name}
                    </h2>
                  </div>
                  <p className="text-cyan-500/60 text-sm mb-2">
                    {game.tagline}
                  </p>
                  <div className="flex gap-4 text-xs font-mono text-cyan-700/60">
                    <span>👥 {game.players}</span>
                    <span>⏱ {game.time}</span>
                  </div>
                </div>
                <div className="text-cyan-800 group-hover:text-cyan-500 transition-colors text-lg mt-1">
                  →
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="text-center mt-10 space-y-2">
          <p className="text-cyan-800/50 text-xs font-mono">
            play the simulators here · run the real games over bitchat mesh
          </p>
          <div className="flex items-center justify-center gap-4 text-xs font-mono">
            <a
              href="https://github.com/permissionlesstech/bitchat"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-700 hover:text-cyan-500 transition-colors"
            >
              bitchat ↗
            </a>
            <span className="text-cyan-900/40">·</span>
            <a
              href="https://github.com/yourusername/bitchat-games"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-700 hover:text-cyan-500 transition-colors"
            >
              source ↗
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
