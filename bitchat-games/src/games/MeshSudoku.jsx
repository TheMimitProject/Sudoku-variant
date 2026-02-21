import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ============================================================
// SUDOKU ENGINE
// ============================================================

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function createEmptyGrid() {
  return Array.from({ length: 9 }, () => Array(9).fill(0));
}

function isValid(grid, row, col, num) {
  for (let c = 0; c < 9; c++) if (grid[row][c] === num) return false;
  for (let r = 0; r < 9; r++) if (grid[r][col] === num) return false;
  const br = Math.floor(row / 3) * 3, bc = Math.floor(col / 3) * 3;
  for (let r = br; r < br + 3; r++)
    for (let c = bc; c < bc + 3; c++)
      if (grid[r][c] === num) return false;
  return true;
}

function solveSudoku(grid) {
  const g = grid.map((r) => [...r]);
  function solve() {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (g[r][c] === 0) {
          const nums = shuffleArray([1, 2, 3, 4, 5, 6, 7, 8, 9]);
          for (const n of nums) {
            if (isValid(g, r, c, n)) {
              g[r][c] = n;
              if (solve()) return true;
              g[r][c] = 0;
            }
          }
          return false;
        }
      }
    }
    return true;
  }
  solve();
  return g;
}

function generatePuzzle(clues = 32) {
  const solution = solveSudoku(createEmptyGrid());
  const puzzle = solution.map((r) => [...r]);
  const cells = shuffleArray(
    Array.from({ length: 81 }, (_, i) => [Math.floor(i / 9), i % 9])
  );
  let removed = 0;
  for (const [r, c] of cells) {
    if (removed >= 81 - clues) break;
    puzzle[r][c] = 0;
    removed++;
  }
  return { puzzle, solution };
}

// ============================================================
// CONSTANTS
// ============================================================

const BOT_NAMES = ["ghostnode", "rf_witch", "blewalker", "meshpunk", "darkpacket"];
const DIFFICULTIES = { easy: 38, medium: 32, hard: 26 };
const pick = (a) => a[Math.floor(Math.random() * a.length)];

const BOT_CHAT = [
  "hmm R__C__ looks like a __",
  "that was mine!",
  "easy one",
  "thinking...",
  "the 3x3 box trick works here",
  "anyone else stuck on row __?",
  "gg nice move",
  "I see it now",
  "mesh lag is killing me",
  "too slow!",
];

// ============================================================
// COMPONENTS
// ============================================================

function ChatLine({ text, type }) {
  const styles = {
    system: "text-amber-500/70 italic",
    bot: "text-cyan-400/80",
    you: "text-lime-300/90",
    claim: "text-fuchsia-400 font-bold",
    error: "text-red-400/80",
    info: "text-amber-300/60",
  };
  return (
    <div className={`text-xs font-mono leading-relaxed py-px ${styles[type] || styles.system}`}>
      {text}
    </div>
  );
}

function MiniGrid({ grid, solution, claims, selectedCell, onCellClick, clueGrid }) {
  return (
    <div
      className="inline-grid gap-0 border-2 border-cyan-700/60 rounded"
      style={{ gridTemplateColumns: "repeat(9, 1fr)" }}
    >
      {grid.map((row, r) =>
        row.map((val, c) => {
          const isClue = clueGrid[r][c] !== 0;
          const claim = claims[`${r},${c}`];
          const isSelected = selectedCell && selectedCell[0] === r && selectedCell[1] === c;
          const isWrong = claim?.wrong;

          // Border logic for 3x3 boxes
          const borderR = c === 2 || c === 5 ? "border-r-2 border-r-cyan-700/40" : "border-r border-r-gray-800/60";
          const borderB = r === 2 || r === 5 ? "border-b-2 border-b-cyan-700/40" : "border-b border-b-gray-800/60";

          let bg = "bg-gray-950/80";
          let textColor = "text-gray-600";

          if (isClue) {
            bg = "bg-gray-900/90";
            textColor = "text-cyan-300/70";
          } else if (claim) {
            if (claim.by === "you") {
              bg = isWrong ? "bg-red-950/40" : "bg-lime-950/30";
              textColor = isWrong ? "text-red-400 line-through" : "text-lime-400";
            } else {
              bg = isWrong ? "bg-red-950/30" : "bg-fuchsia-950/20";
              textColor = isWrong ? "text-red-400/60 line-through" : "text-fuchsia-400/80";
            }
          } else if (isSelected) {
            bg = "bg-cyan-950/40";
          }

          return (
            <button
              key={`${r}-${c}`}
              onClick={() => !isClue && !claim && onCellClick(r, c)}
              disabled={isClue || (claim && !claim.wrong)}
              className={`
                w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center text-xs sm:text-sm font-mono font-bold
                ${bg} ${textColor} ${borderR} ${borderB}
                transition-all duration-150
                ${!isClue && !claim ? "hover:bg-cyan-900/30 cursor-pointer" : "cursor-default"}
                ${isSelected ? "ring-1 ring-cyan-500 ring-inset" : ""}
              `}
              style={{ minWidth: 0, padding: 0 }}
            >
              {val !== 0 ? val : ""}
            </button>
          );
        })
      )}
    </div>
  );
}

function Scoreboard({ scores, bots, round }) {
  const all = [{ name: "you", score: scores.you || 0 }, ...bots.map((b) => ({ name: b, score: scores[b] || 0 }))];
  all.sort((a, b) => b.score - a.score);
  return (
    <div className="space-y-0.5">
      {all.map((p, i) => (
        <div key={p.name} className="flex items-center gap-2 text-xs font-mono">
          <span className={`w-3 text-right ${i === 0 ? "text-amber-400" : "text-gray-600"}`}>
            {i + 1}
          </span>
          <span className={`flex-1 ${p.name === "you" ? "text-lime-400" : "text-cyan-500/70"}`}>
            {p.name}
          </span>
          <span className="text-amber-400/80 tabular-nums w-6 text-right">{p.score}</span>
        </div>
      ))}
    </div>
  );
}

function NumberPad({ onNumber, disabled }) {
  return (
    <div className="grid grid-cols-9 gap-1">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
        <button
          key={n}
          onClick={() => onNumber(n)}
          disabled={disabled}
          className={`
            h-9 rounded font-mono font-bold text-sm
            ${disabled
              ? "bg-gray-900/50 text-gray-700 cursor-not-allowed"
              : "bg-cyan-950/40 text-cyan-300 hover:bg-cyan-800/40 hover:text-cyan-100 active:bg-cyan-700/40 border border-cyan-800/30 hover:border-cyan-600/50"
            }
            transition-all
          `}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

// ============================================================
// MAIN GAME
// ============================================================

export default function MeshSudoku() {
  const [tab, setTab] = useState("rules");
  const [difficulty, setDifficulty] = useState("medium");
  const [puzzle, setPuzzle] = useState(null);
  const [solution, setSolution] = useState(null);
  const [clueGrid, setClueGrid] = useState(null);
  const [currentGrid, setCurrentGrid] = useState(null);
  const [claims, setClaims] = useState({});
  const [scores, setScores] = useState({});
  const [selectedCell, setSelectedCell] = useState(null);
  const [chat, setChat] = useState([]);
  const [gameActive, setGameActive] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [activeBots, setActiveBots] = useState([]);
  const [cooldown, setCooldown] = useState(false);
  const chatRef = useRef(null);
  const botTimerRef = useRef(null);
  const botIntervalRef = useRef(null);

  const addChat = useCallback((text, type = "system") => {
    setChat((prev) => [...prev.slice(-60), { text, type, id: Date.now() + Math.random() }]);
  }, []);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [chat]);

  // Count remaining empty cells
  const remainingCells = useMemo(() => {
    if (!currentGrid || !clueGrid) return 81;
    let count = 0;
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++)
        if (currentGrid[r][c] === 0 && !claims[`${r},${c}`]) count++;
    return count;
  }, [currentGrid, clueGrid, claims]);

  // Clean up bot timers
  useEffect(() => {
    return () => {
      if (botTimerRef.current) clearTimeout(botTimerRef.current);
      if (botIntervalRef.current) clearInterval(botIntervalRef.current);
    };
  }, []);

  // --- Start Game ---
  const startGame = useCallback(() => {
    if (botTimerRef.current) clearTimeout(botTimerRef.current);
    if (botIntervalRef.current) clearInterval(botIntervalRef.current);

    const clueCount = DIFFICULTIES[difficulty];
    const { puzzle: p, solution: s } = generatePuzzle(clueCount);
    setPuzzle(p);
    setSolution(s);
    setClueGrid(p.map((r) => [...r]));
    setCurrentGrid(p.map((r) => [...r]));
    setClaims({});
    setSelectedCell(null);
    setGameOver(false);
    setCooldown(false);

    const bots = shuffleArray(BOT_NAMES).slice(0, 3);
    setActiveBots(bots);

    const initScores = { you: 0 };
    bots.forEach((b) => (initScores[b] = 0));
    setScores(initScores);

    setChat([]);
    addChat("--- MESH SUDOKU v0.1 ---");
    addChat(`/join #sudoku · difficulty: ${difficulty}`);
    addChat(`/who → ${["you", ...bots].join(", ")}`);
    addChat(">>> Board broadcast to all nodes.");
    addChat("Race to claim cells! /sudo play R_C_=N");

    setGameActive(true);
    setTab("play");
  }, [difficulty, addChat]);

  // --- Bot AI ---
  useEffect(() => {
    if (!gameActive || gameOver) return;

    const botMove = () => {
      if (!solution || !currentGrid) return;

      // Find unclaimed empty cells
      const empty = [];
      for (let r = 0; r < 9; r++)
        for (let c = 0; c < 9; c++)
          if (clueGrid[r][c] === 0 && !claims[`${r},${c}`] && currentGrid[r][c] === 0)
            empty.push([r, c]);

      if (empty.length === 0) return;

      const bot = pick(activeBots);
      const [r, c] = pick(empty);
      const correct = solution[r][c];

      // Bots are ~80% accurate
      const isCorrect = Math.random() < 0.8;
      const val = isCorrect ? correct : pick([1,2,3,4,5,6,7,8,9].filter(n => n !== correct));
      const actually = val === correct;

      const key = `${r},${c}`;

      addChat(`<${bot}> /sudo play R${r + 1}C${c + 1}=${val}`, "bot");

      if (actually) {
        setClaims((prev) => ({ ...prev, [key]: { by: bot, val } }));
        setCurrentGrid((prev) => {
          const g = prev.map((row) => [...row]);
          g[r][c] = val;
          return g;
        });
        setScores((prev) => ({ ...prev, [bot]: (prev[bot] || 0) + 1 }));
        addChat(`>>> ✓ ${bot} claims R${r + 1}C${c + 1}`, "claim");
      } else {
        setClaims((prev) => ({ ...prev, [key]: { by: bot, val, wrong: true } }));
        addChat(`>>> ✗ ${bot} guessed wrong! -1 penalty`, "error");
        setScores((prev) => ({ ...prev, [bot]: (prev[bot] || 0) - 1 }));
        // Clear wrong claim after a delay
        setTimeout(() => {
          setClaims((prev) => {
            const next = { ...prev };
            if (next[key]?.wrong) delete next[key];
            return next;
          });
        }, 2000);
      }

      // Occasional chat flavor
      if (Math.random() < 0.3) {
        setTimeout(() => {
          const msg = pick(BOT_CHAT)
            .replace("R__C__", `R${Math.ceil(Math.random()*9)}C${Math.ceil(Math.random()*9)}`)
            .replace("__", String(Math.ceil(Math.random()*9)));
          addChat(`<${pick(activeBots)}> ${msg}`, "bot");
        }, 800 + Math.random() * 1200);
      }
    };

    // Bot makes a move every 3-7 seconds
    const speed = difficulty === "easy" ? 6000 : difficulty === "medium" ? 4500 : 3500;
    botIntervalRef.current = setInterval(botMove, speed + Math.random() * 2000);

    return () => {
      if (botIntervalRef.current) clearInterval(botIntervalRef.current);
    };
  }, [gameActive, gameOver, solution, currentGrid, clueGrid, claims, activeBots, difficulty, addChat]);

  // --- Check for game over ---
  useEffect(() => {
    if (!gameActive || !solution || !clueGrid) return;
    let allFilled = true;
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++)
        if (clueGrid[r][c] === 0 && !claims[`${r},${c}`]) allFilled = false;
    if (!allFilled) {
      // Also check claims without wrong flag
      let validClaims = true;
      for (let r = 0; r < 9; r++)
        for (let c = 0; c < 9; c++) {
          if (clueGrid[r][c] === 0) {
            const cl = claims[`${r},${c}`];
            if (!cl || cl.wrong) { validClaims = false; break; }
          }
        }
      if (!validClaims) return;
    }

    // All cells claimed correctly
    setGameOver(true);
    setGameActive(false);
    if (botIntervalRef.current) clearInterval(botIntervalRef.current);

    const allScores = { you: scores.you || 0, ...Object.fromEntries(activeBots.map(b => [b, scores[b] || 0])) };
    const winner = Object.entries(allScores).sort((a, b) => b[1] - a[1])[0];

    addChat("━━━━━━━━━━━━━━━━━━━━━━━━━━");
    addChat(">>> PUZZLE COMPLETE!");
    addChat(`🏆 Winner: ${winner[0]} with ${winner[1]} points`, "claim");
    addChat("━━━━━━━━━━━━━━━━━━━━━━━━━━");
  }, [claims, clueGrid, solution, scores, activeBots, gameActive, addChat]);

  // --- Player places number ---
  const placeNumber = (num) => {
    if (!selectedCell || !gameActive || cooldown) return;
    const [r, c] = selectedCell;
    const key = `${r},${c}`;

    if (clueGrid[r][c] !== 0 || claims[key]) return;

    addChat(`<you> /sudo play R${r + 1}C${c + 1}=${num}`, "you");

    if (num === solution[r][c]) {
      setClaims((prev) => ({ ...prev, [key]: { by: "you", val: num } }));
      setCurrentGrid((prev) => {
        const g = prev.map((row) => [...row]);
        g[r][c] = num;
        return g;
      });
      setScores((prev) => ({ ...prev, you: (prev.you || 0) + 1 }));
      addChat(`>>> ✓ you claim R${r + 1}C${c + 1}`, "claim");
      setSelectedCell(null);
    } else {
      addChat(`>>> ✗ wrong! -1 penalty · 3s cooldown`, "error");
      setScores((prev) => ({ ...prev, you: (prev.you || 0) - 1 }));
      setCooldown(true);
      setTimeout(() => setCooldown(false), 3000);
    }
  };

  // --- Keyboard input ---
  useEffect(() => {
    const handler = (e) => {
      if (!gameActive || tab !== "play") return;
      const num = parseInt(e.key);
      if (num >= 1 && num <= 9) placeNumber(num);
      if (e.key === "Escape") setSelectedCell(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  // ============================================================
  // RENDER
  // ============================================================

  const RulesTab = () => (
    <div className="p-4 space-y-5 pb-8">
      <div className="text-center py-5 border-b border-cyan-900/30">
        <div className="text-xs tracking-[0.4em] text-cyan-700 uppercase mb-1">bitchat mesh game</div>
        <h1 className="text-2xl font-black text-cyan-300 tracking-tight" style={{ fontFamily: "'Courier New', monospace" }}>
          MESH SUDOKU
        </h1>
        <div className="text-cyan-600/50 text-xs mt-1">competitive cell-claiming over bluetooth</div>
      </div>

      <section>
        <h2 className="text-amber-400/80 text-xs font-mono uppercase tracking-widest mb-2">▍How It Works</h2>
        <p className="text-cyan-200/60 text-sm leading-relaxed">
          A Sudoku puzzle is broadcast to all players on <span className="text-amber-400/70 font-mono">#sudoku</span>. Players race to solve cells — each correct answer <strong className="text-lime-400">claims</strong> that cell and earns a point. Wrong guesses cost a point and trigger a cooldown. Most points when the puzzle is complete wins.
        </p>
      </section>

      <section>
        <h2 className="text-amber-400/80 text-xs font-mono uppercase tracking-widest mb-2">▍Commands</h2>
        <div className="font-mono text-xs space-y-1.5 bg-black/30 rounded p-3 border border-cyan-900/20">
          <div><span className="text-cyan-400">/sudo show</span><span className="text-cyan-700 ml-3">→ request current board state</span></div>
          <div><span className="text-cyan-400">/sudo play R3C5=7</span><span className="text-cyan-700 ml-3">→ place 7 at row 3, col 5</span></div>
          <div><span className="text-cyan-400">/sudo score</span><span className="text-cyan-700 ml-3">→ show scoreboard</span></div>
          <div><span className="text-cyan-400">/sudo check</span><span className="text-cyan-700 ml-3">→ validate current board</span></div>
          <div><span className="text-cyan-400">/who</span><span className="text-cyan-700 ml-3">→ list active players</span></div>
        </div>
      </section>

      <section>
        <h2 className="text-amber-400/80 text-xs font-mono uppercase tracking-widest mb-2">▍Rules</h2>
        <div className="space-y-2">
          {[
            ["Correct placement", "+1 point, cell is permanently claimed by you", "text-lime-400"],
            ["Wrong guess", "-1 point, 3-second cooldown before next move", "text-red-400"],
            ["Claimed cells", "Cannot be overwritten — first correct answer wins", "text-fuchsia-400"],
            ["Win condition", "Most claimed cells when the puzzle is complete", "text-amber-400"],
          ].map(([title, desc, color], i) => (
            <div key={i} className="bg-black/20 border border-cyan-900/15 rounded px-3 py-2 flex gap-2 items-start">
              <span className={`${color} text-xs font-bold font-mono whitespace-nowrap`}>{title}:</span>
              <span className="text-cyan-200/50 text-xs">{desc}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-amber-400/80 text-xs font-mono uppercase tracking-widest mb-2">▍Mesh Considerations</h2>
        <p className="text-cyan-200/50 text-xs leading-relaxed">
          Each move is a single short message (~25 bytes). The host periodically re-broadcasts board state for players who joined late or missed packets. BLE latency means two players might solve the same cell simultaneously — the first message to reach the host wins, adding a physical-proximity advantage to nearby nodes.
        </p>
      </section>

      <section>
        <h2 className="text-amber-400/80 text-xs font-mono uppercase tracking-widest mb-2">▍Strategy</h2>
        <p className="text-cyan-200/50 text-xs leading-relaxed">
          Don't just race — pick your battles. Hard cells that others skip are worth the same as easy ones. Watch the chat to see where opponents are focused and hunt in a different region. Accuracy beats speed: a wrong guess costs you a point <em>and</em> three seconds while others keep claiming.
        </p>
      </section>

      <section>
        <h2 className="text-amber-400/80 text-xs font-mono uppercase tracking-widest mb-2">▍Difficulty</h2>
        <div className="flex gap-2">
          {Object.keys(DIFFICULTIES).map((d) => (
            <button
              key={d}
              onClick={() => setDifficulty(d)}
              className={`flex-1 py-2 rounded text-xs font-mono uppercase tracking-wider border transition-all ${
                difficulty === d
                  ? "bg-cyan-900/40 border-cyan-600/60 text-cyan-300"
                  : "bg-black/20 border-cyan-900/20 text-cyan-700 hover:border-cyan-700/40 hover:text-cyan-500"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </section>

      <div className="text-center pt-3 border-t border-cyan-900/20">
        <button
          onClick={startGame}
          className="bg-cyan-600 hover:bg-cyan-500 text-black font-mono font-bold text-sm px-8 py-3 rounded transition-all hover:shadow-lg hover:shadow-cyan-500/20"
        >
          ▶ START GAME
        </button>
        <div className="text-cyan-700/50 text-xs mt-2">play against 3 mesh bots →</div>
      </div>
    </div>
  );

  const PlayTab = () => (
    <div className="flex flex-col h-full">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-black/50 border-b border-cyan-900/30 flex-shrink-0">
        <div className="text-xs font-mono text-cyan-600/60">
          #sudoku · {difficulty} · {remainingCells} left
        </div>
        <div className="text-xs font-mono">
          {cooldown ? (
            <span className="text-red-400 animate-pulse">cooldown...</span>
          ) : (
            <span className="text-lime-500/70">ready</span>
          )}
        </div>
      </div>

      {/* Grid + Scoreboard */}
      <div className="flex-shrink-0 p-2 sm:p-3">
        <div className="flex gap-3 items-start justify-center">
          {currentGrid && (
            <MiniGrid
              grid={currentGrid}
              solution={solution}
              claims={claims}
              selectedCell={selectedCell}
              onCellClick={(r, c) => setSelectedCell([r, c])}
              clueGrid={clueGrid}
            />
          )}
          <div className="w-24 flex-shrink-0">
            <div className="text-xs font-mono text-amber-500/60 uppercase tracking-wider mb-1.5">Score</div>
            <Scoreboard scores={scores} bots={activeBots} />
          </div>
        </div>
      </div>

      {/* Number Pad */}
      <div className="flex-shrink-0 px-3 pb-1.5">
        <NumberPad onNumber={placeNumber} disabled={!selectedCell || !gameActive || cooldown} />
        {selectedCell && (
          <div className="text-center text-xs font-mono text-cyan-600/50 mt-1">
            Selected: R{selectedCell[0] + 1}C{selectedCell[1] + 1}
            {" · "}
            <button onClick={() => setSelectedCell(null)} className="text-cyan-500 hover:text-cyan-300 underline">
              deselect
            </button>
          </div>
        )}
        {!selectedCell && gameActive && (
          <div className="text-center text-xs font-mono text-cyan-800/60 mt-1">
            tap an empty cell, then a number
          </div>
        )}
      </div>

      {/* Chat Log */}
      <div
        ref={chatRef}
        className="flex-1 overflow-y-auto px-3 py-1.5 border-t border-cyan-900/25 bg-black/20"
        style={{ minHeight: 60 }}
      >
        {chat.map((m) => (
          <ChatLine key={m.id} text={m.text} type={m.type} />
        ))}
      </div>

      {/* Bottom Actions */}
      {gameOver && (
        <div className="flex gap-2 p-3 border-t border-cyan-900/30 bg-black/40 flex-shrink-0">
          <button
            onClick={() => setTab("rules")}
            className="flex-1 bg-cyan-950/40 text-cyan-500 font-mono text-xs py-2 rounded hover:bg-cyan-900/30 border border-cyan-800/30"
          >
            ← rules
          </button>
          <button
            onClick={startGame}
            className="flex-1 bg-cyan-600 text-black font-mono font-bold text-xs py-2 rounded hover:bg-cyan-500"
          >
            new game
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div
      className="min-h-screen flex items-center justify-center p-3"
      style={{
        fontFamily: "'Courier New', 'Courier', monospace",
        background: "linear-gradient(160deg, #030a0f 0%, #061218 40%, #0a1520 100%)",
      }}
    >
      {/* Subtle scan line overlay */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,200,0.1) 2px, rgba(0,255,200,0.1) 4px)",
        }}
      />

      <div
        className="relative w-full max-w-md border border-cyan-900/40 rounded-lg overflow-hidden"
        style={{
          height: "min(90vh, 780px)",
          background: "linear-gradient(180deg, rgba(6,18,24,0.97) 0%, rgba(3,10,15,0.99) 100%)",
          boxShadow: "0 0 60px rgba(0,180,200,0.05), 0 0 120px rgba(0,180,200,0.02)",
        }}
      >
        {/* Tab Header */}
        <div className="flex border-b border-cyan-900/30 bg-black/30 relative z-10">
          <button
            onClick={() => setTab("rules")}
            className={`flex-1 py-2.5 text-xs font-mono uppercase tracking-widest transition-all ${
              tab === "rules" ? "text-cyan-400 border-b-2 border-cyan-500 bg-cyan-950/15" : "text-cyan-800 hover:text-cyan-600"
            }`}
          >
            Rules
          </button>
          <button
            onClick={() => { setTab("play"); if (!gameActive && !gameOver) startGame(); }}
            className={`flex-1 py-2.5 text-xs font-mono uppercase tracking-widest transition-all ${
              tab === "play" ? "text-cyan-400 border-b-2 border-cyan-500 bg-cyan-950/15" : "text-cyan-800 hover:text-cyan-600"
            }`}
          >
            Play
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto relative z-10" style={{ height: "calc(100% - 42px)" }}>
          {tab === "rules" ? <RulesTab /> : <PlayTab />}
        </div>
      </div>
    </div>
  );
}
