import { useState, useEffect, useRef, useCallback } from "react";

// ============================================================
// CONSTANTS
// ============================================================

const ROLES = { SIGNAL: "Signal", JAMMER: "Jammer" };
const PHASES = {
  LOBBY: "lobby",
  NIGHT: "night",
  DAY: "day",
  VOTE: "vote",
  RESULT: "result",
};
const BOT_NAMES = [
  "ghostnode",
  "meshpunk",
  "rf_witch",
  "darkpacket",
  "blewalker",
  "nostr_kid",
  "zerohop",
  "staticnoise",
];
const FLAVORS = {
  jamSignal: [
    "📡 A burst of noise floods the mesh...",
    "⚡ Someone is broadcasting garbage data...",
    "🔇 The signal degrades — interference detected.",
  ],
  relaySuccess: [
    "✅ Relay chain intact. Message delivered.",
    "📨 Packet reached its destination across 3 hops.",
    "🔗 Mesh link verified. All clear.",
  ],
  relayFail: [
    "❌ Message lost in transit. Relay broken.",
    "💀 Dead packet. The chain was severed.",
    "⚠️ Hop 4 of 7 failed. Data unrecoverable.",
  ],
  accusation: [
    "points an antenna at",
    "triangulates the signal from",
    "suspects interference from",
    "runs a trace back to",
  ],
};

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ============================================================
// SUBCOMPONENTS
// ============================================================

function ChatMessage({ msg, isSystem, isPrivate, highlight }) {
  const base = "font-mono leading-relaxed py-0.5 px-1 rounded";
  if (isSystem)
    return (
      <div className={`${base} text-amber-400/80 italic text-xs`}>
        {">>> "}
        {msg}
      </div>
    );
  if (isPrivate)
    return (
      <div className={`${base} text-fuchsia-400/70 text-xs`}>
        <span className="text-fuchsia-600">[DM] </span>
        {msg}
      </div>
    );
  if (highlight)
    return (
      <div
        className={`${base} text-lime-300 font-bold text-sm bg-lime-950/30`}
      >
        {msg}
      </div>
    );
  return <div className={`${base} text-emerald-300/90 text-xs`}>{msg}</div>;
}

function MeshBg() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    let frame;
    const nodes = Array.from({ length: 18 }, () => ({
      x: Math.random() * 400,
      y: Math.random() * 600,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: 2 + Math.random() * 2,
    }));
    const draw = () => {
      ctx.clearRect(0, 0, 400, 600);
      nodes.forEach((n) => {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > 400) n.vx *= -1;
        if (n.y < 0 || n.y > 600) n.vy *= -1;
      });
      ctx.strokeStyle = "rgba(52, 211, 153, 0.06)";
      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          if (Math.sqrt(dx * dx + dy * dy) < 120) {
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }
      nodes.forEach((n) => {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(52, 211, 153, 0.15)";
        ctx.fill();
      });
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <canvas
      ref={canvasRef}
      width={400}
      height={600}
      className="absolute top-0 left-0 w-full h-full opacity-50 pointer-events-none"
    />
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function MeshHunt() {
  const [tab, setTab] = useState("design");
  const [phase, setPhase] = useState(PHASES.LOBBY);
  const [round, setRound] = useState(0);
  const [messages, setMessages] = useState([]);
  const [players, setPlayers] = useState([]);
  const [myRole, setMyRole] = useState(null);
  const [selectedVote, setSelectedVote] = useState(null);
  const [eliminated, setEliminated] = useState([]);
  const [gameOver, setGameOver] = useState(null);
  const [inputVal, setInputVal] = useState("");
  const chatEndRef = useRef(null);

  const addMsg = useCallback(
    (msg, isSystem = false, isPrivate = false, highlight = false) => {
      setMessages((prev) => [
        ...prev.slice(-80),
        { msg, isSystem, isPrivate, highlight, id: Date.now() + Math.random() },
      ]);
    },
    []
  );

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const startGame = () => {
    const bots = BOT_NAMES.sort(() => Math.random() - 0.5).slice(0, 5);
    const allPlayers = ["you", ...bots];
    const jammerIdx = Math.floor(Math.random() * allPlayers.length);
    const roles = allPlayers.map((name, i) => ({
      name,
      role: i === jammerIdx ? ROLES.JAMMER : ROLES.SIGNAL,
      alive: true,
    }));
    setPlayers(roles);
    setMyRole(roles[0].role);
    setEliminated([]);
    setGameOver(null);
    setRound(1);
    setMessages([]);
    setSelectedVote(null);

    addMsg("--- MESH HUNT v0.1 ---", true);
    addMsg(`/who → 6 nodes online: ${allPlayers.join(", ")}`, true);
    addMsg("You joined #meshhunt", true);
    addMsg(
      `Your role: ${
        roles[0].role === ROLES.JAMMER
          ? "🔴 JAMMER — sabotage relays without being caught"
          : "🟢 SIGNAL — find and vote out the Jammer"
      }`,
      false,
      true
    );
    addMsg("Night falls on the mesh...", true);
    setPhase(PHASES.NIGHT);
  };

  const doNightAction = (targetName) => {
    if (myRole === ROLES.JAMMER) {
      addMsg(`/msg meshbot jam ${targetName}`, false, true);
      addMsg(`You target ${targetName}'s relay link...`, true);
    } else {
      addMsg(`/msg meshbot relay ${targetName}`, false, true);
      addMsg(`You route your packet through ${targetName}...`, true);
    }

    setTimeout(() => {
      const jammer = players.find((p) => p.role === ROLES.JAMMER && p.alive);
      const alive = players.filter((p) => p.alive && p.name !== "you");
      let jammedPlayer;

      if (myRole === ROLES.JAMMER) {
        jammedPlayer = targetName;
      } else {
        const possibleTargets = players.filter(
          (p) => p.alive && p.name !== jammer.name
        );
        jammedPlayer = pick(possibleTargets).name;
      }

      const wasJammed = Math.random() < 0.65;

      addMsg("Dawn breaks on the mesh.", true);
      if (wasJammed) {
        addMsg(pick(FLAVORS.jamSignal), false, false, true);
        addMsg(`${jammedPlayer}'s relay was disrupted!`, true);
        if (jammedPlayer !== "you") {
          addMsg(pick(FLAVORS.relayFail), true);
        } else {
          addMsg("Your outgoing packets failed to deliver.", false, true);
        }
      } else {
        addMsg(pick(FLAVORS.relaySuccess), false, false, true);
        addMsg(
          "All relays held overnight. No interference detected.",
          true
        );
      }

      setTimeout(() => {
        const chatters = alive.sort(() => Math.random() - 0.5).slice(0, 3);
        chatters.forEach((bot, i) => {
          setTimeout(() => {
            const lines = [
              `<${bot.name}> anyone else getting dropped packets?`,
              `<${bot.name}> my relay to ${pick(alive).name} was clean`,
              `<${bot.name}> idk, ${pick(alive).name} seems sus`,
              `<${bot.name}> the jammer is close, i can feel the interference`,
              `<${bot.name}> /who shows ${players.filter((p) => p.alive).length} nodes still up`,
              `<${bot.name}> trust no one on this mesh`,
            ];
            addMsg(pick(lines));
          }, i * 600);
        });
        setTimeout(() => {
          addMsg("--- VOTE PHASE: type a name or click to vote ---", true);
          setPhase(PHASES.VOTE);
        }, chatters.length * 600 + 500);
      }, 800);

      setPhase(PHASES.DAY);
    }, 1500);
  };

  const castVote = (targetName) => {
    setSelectedVote(targetName);
    addMsg(
      `you ${pick(FLAVORS.accusation)} ${targetName}`,
      false,
      false,
      true
    );

    const alive = players.filter((p) => p.alive && p.name !== "you");
    const votes = {};
    votes[targetName] = 1;

    alive.forEach((bot) => {
      const choices = players.filter((p) => p.alive && p.name !== bot.name);
      const vote = pick(choices).name;
      votes[vote] = (votes[vote] || 0) + 1;
    });

    setTimeout(() => {
      alive.forEach((bot, i) => {
        setTimeout(() => {
          const choices = players.filter((p) => p.alive && p.name !== bot.name);
          const vote = pick(choices).name;
          addMsg(`<${bot.name}> /vote ${vote}`);
        }, i * 400);
      });

      setTimeout(() => {
        const maxVotes = Math.max(...Object.values(votes));
        const topVoted = Object.keys(votes).filter(
          (k) => votes[k] === maxVotes
        );
        const eliminatedName = pick(topVoted);
        const eliminatedPlayer = players.find(
          (p) => p.name === eliminatedName
        );

        addMsg(
          `--- ${eliminatedName} was disconnected from the mesh! ---`,
          true
        );
        addMsg(
          eliminatedPlayer.role === ROLES.JAMMER
            ? `${eliminatedName} was the 🔴 JAMMER!`
            : `${eliminatedName} was a 🟢 SIGNAL node...`,
          false,
          false,
          true
        );

        const newPlayers = players.map((p) =>
          p.name === eliminatedName ? { ...p, alive: false } : p
        );
        setPlayers(newPlayers);
        setEliminated((prev) => [...prev, eliminatedName]);

        const jammerAlive = newPlayers.some(
          (p) => p.role === ROLES.JAMMER && p.alive
        );
        const signalsAlive = newPlayers.filter(
          (p) => p.role === ROLES.SIGNAL && p.alive
        ).length;

        if (!jammerAlive) {
          setGameOver("signals");
          addMsg("🟢 THE MESH IS CLEAN! Signals win!", false, false, true);
          setPhase(PHASES.RESULT);
        } else if (signalsAlive <= 1) {
          setGameOver("jammer");
          addMsg(
            "🔴 THE MESH IS COMPROMISED! Jammer wins!",
            false,
            false,
            true
          );
          setPhase(PHASES.RESULT);
        } else {
          setTimeout(() => {
            setRound((r) => r + 1);
            setSelectedVote(null);
            addMsg(`--- Night ${round + 1} falls on the mesh... ---`, true);
            setPhase(PHASES.NIGHT);
          }, 2000);
        }
      }, alive.length * 400 + 600);
    }, 300);
  };

  const handleInput = () => {
    if (!inputVal.trim()) return;
    addMsg(`<you> ${inputVal}`);
    setInputVal("");
  };

  const alivePlayers = players.filter((p) => p.alive && p.name !== "you");
  const meAlive = players.find((p) => p.name === "you")?.alive;

  // ========================
  // DESIGN TAB
  // ========================

  const DesignTab = () => (
    <div className="space-y-6 pb-8">
      <div className="text-center py-6 border-b border-emerald-900/50">
        <div className="text-xs tracking-[0.5em] text-emerald-600 uppercase mb-2">
          Protocol Specification
        </div>
        <h1
          className="text-2xl font-black text-emerald-300 tracking-tight"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          MESH HUNT
        </h1>
        <div className="text-emerald-500/60 text-xs mt-1">
          A social deduction game for the bitchat Bluetooth mesh
        </div>
        <div className="text-amber-500/40 text-xs mt-3 font-mono">
          v0.1 · 4-8 players · text-only · no internet required
        </div>
      </div>

      <section>
        <h2 className="text-amber-400/80 text-xs font-mono uppercase tracking-widest mb-2">
          ▍Concept
        </h2>
        <p className="text-emerald-200/70 text-sm leading-relaxed">
          A <strong className="text-emerald-300">Jammer</strong> has infiltrated
          your local Bluetooth mesh. Each night they disrupt a relay link. Each
          day, the group debates and votes to disconnect a suspect. The Jammer
          wins by eliminating enough Signal nodes to collapse the mesh. The
          Signals win by identifying and disconnecting the Jammer.
        </p>
        <p className="text-emerald-200/50 text-sm mt-2 leading-relaxed">
          All gameplay happens through normal bitchat messages — no app, no
          server, no internet. Just text commands on{" "}
          <span className="text-amber-400/70 font-mono">#meshhunt</span>.
        </p>
      </section>

      <section>
        <h2 className="text-amber-400/80 text-xs font-mono uppercase tracking-widest mb-2">
          ▍Why This Works on BLE Mesh
        </h2>
        <div className="grid grid-cols-1 gap-2">
          {[
            [
              "Tiny payloads",
              "Each game action is a single short text message — well under BLE's packet limits",
            ],
            [
              "Async-tolerant",
              "Turn-based phases (night → day → vote) naturally handle multi-hop latency",
            ],
            [
              "No central server",
              "A volunteer 'meshbot' role runs a simple script, or players self-moderate with honor rules",
            ],
            [
              "Fluid participation",
              "Players can drop in/out between rounds; the mesh is resilient by nature",
            ],
            [
              "Text-only",
              "Uses existing /msg and channel messaging — zero protocol changes needed",
            ],
          ].map(([title, desc], i) => (
            <div
              key={i}
              className="bg-emerald-950/30 border border-emerald-900/30 rounded px-3 py-2"
            >
              <span className="text-emerald-400 text-xs font-bold">
                {title}:
              </span>
              <span className="text-emerald-200/50 text-xs ml-2">{desc}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-amber-400/80 text-xs font-mono uppercase tracking-widest mb-2">
          ▍Roles
        </h2>
        <div className="flex gap-3">
          <div className="flex-1 bg-emerald-950/40 border border-emerald-800/30 rounded p-3">
            <div className="text-emerald-400 font-bold text-sm mb-1">
              🟢 Signal
            </div>
            <div className="text-emerald-200/50 text-xs leading-relaxed">
              Relay messages faithfully. Discuss, deduce, vote. Find the Jammer
              before the mesh collapses.
            </div>
          </div>
          <div className="flex-1 bg-red-950/30 border border-red-900/30 rounded p-3">
            <div className="text-red-400 font-bold text-sm mb-1">
              🔴 Jammer
            </div>
            <div className="text-red-200/50 text-xs leading-relaxed">
              Sabotage one relay link per night. Blend in during the day.
              Deflect suspicion. Survive the vote.
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-amber-400/80 text-xs font-mono uppercase tracking-widest mb-2">
          ▍Protocol (How to Play)
        </h2>
        <div className="space-y-3 text-xs">
          {[
            {
              phase: "Setup",
              color: "text-sky-400",
              detail:
                'Players /join #meshhunt. A designated host secretly assigns roles via /msg. One Jammer per 4-6 players; two Jammers for 7-8.',
              cmd: "/msg ghostnode ROLE:signal",
            },
            {
              phase: "Night",
              color: "text-indigo-400",
              detail:
                "The Jammer privately messages the host with their target. Signals can optionally send a 'relay check' — pinging another player to test the link.",
              cmd: "/msg meshbot JAM:darkpacket",
            },
            {
              phase: "Dawn",
              color: "text-amber-400",
              detail:
                "The host announces the result: whose relay was disrupted (or if the jam failed). No one is eliminated at night — just information.",
              cmd: ">>> rf_witch's relay link was disrupted overnight",
            },
            {
              phase: "Day",
              color: "text-emerald-400",
              detail:
                "Open discussion on #meshhunt. Accuse, defend, analyze relay patterns. The Jammer bluffs. Time limit: ~3 minutes (honor system or host timer).",
              cmd: "<blewalker> idk, darkpacket's been real quiet",
            },
            {
              phase: "Vote",
              color: "text-red-400",
              detail:
                "Players publicly /msg their vote. Majority disconnects a node. Ties = no elimination. If the Jammer is caught, Signals win. If Signals drop to ≤ Jammers, Jammer wins.",
              cmd: "/vote darkpacket",
            },
          ].map((step, i) => (
            <div
              key={i}
              className="bg-black/20 border border-emerald-900/20 rounded p-3"
            >
              <div
                className={`${step.color} font-bold uppercase tracking-wider mb-1`}
              >
                {step.phase}
              </div>
              <div className="text-emerald-200/60 leading-relaxed mb-2">
                {step.detail}
              </div>
              <div className="font-mono text-emerald-500/50 bg-black/30 rounded px-2 py-1 inline-block">
                {step.cmd}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-amber-400/80 text-xs font-mono uppercase tracking-widest mb-2">
          ▍Message Spec
        </h2>
        <div className="font-mono text-xs space-y-1 bg-black/30 rounded p-3 border border-emerald-900/20">
          <div className="text-emerald-500/40">
            {"// All messages fit in standard bitchat packets"}
          </div>
          <div className="text-emerald-500/40">
            {"// Max ~200 bytes each — well under BLE limits"}
          </div>
          <div className="text-emerald-300/70">/join #meshhunt</div>
          <div className="text-emerald-300/70">
            /msg meshbot JAM:&lt;target&gt;
          </div>
          <div className="text-emerald-300/70">
            /msg meshbot RELAY:&lt;target&gt;
          </div>
          <div className="text-emerald-300/70">/vote &lt;target&gt;</div>
          <div className="text-emerald-300/70">/who</div>
          <div className="text-emerald-300/70">
            /slap &lt;target&gt; {"// for dramatic accusations"}
          </div>
        </div>
      </section>

      <div className="text-center pt-4 border-t border-emerald-900/30">
        <button
          onClick={() => {
            setTab("play");
            startGame();
          }}
          className="bg-emerald-600 hover:bg-emerald-500 text-black font-mono font-bold text-sm px-6 py-3 rounded transition-all hover:shadow-lg hover:shadow-emerald-500/20"
        >
          ▶ SIMULATE A GAME
        </button>
        <div className="text-emerald-600/40 text-xs mt-2">
          Try the text-based simulator →
        </div>
      </div>
    </div>
  );

  // ========================
  // PLAY TAB
  // ========================

  const PlayTab = () => (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-emerald-900/40 bg-black/40 text-xs font-mono flex-shrink-0">
        <div className="text-emerald-500/60">
          #meshhunt · R{round} · {phase.toUpperCase()}
        </div>
        <div className="flex gap-2">
          {myRole === ROLES.JAMMER ? (
            <span className="text-red-400">🔴 JAMMER</span>
          ) : (
            <span className="text-emerald-400">🟢 SIGNAL</span>
          )}
          <span className="text-emerald-600/40">
            {players.filter((p) => p.alive).length} alive
          </span>
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5"
        style={{ minHeight: 0 }}
      >
        {messages.map((m) => (
          <ChatMessage key={m.id} {...m} />
        ))}
        <div ref={chatEndRef} />
      </div>

      <div className="border-t border-emerald-900/40 bg-black/60 p-3 flex-shrink-0">
        {phase === PHASES.LOBBY && (
          <button
            onClick={startGame}
            className="w-full bg-emerald-700 hover:bg-emerald-600 text-black font-mono font-bold text-sm py-2 rounded"
          >
            /join #meshhunt
          </button>
        )}

        {phase === PHASES.NIGHT && meAlive && (
          <div>
            <div className="text-xs text-emerald-500/50 font-mono mb-2">
              {myRole === ROLES.JAMMER
                ? "Choose a relay to jam:"
                : "Choose a node to relay through:"}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {alivePlayers.map((p) => (
                <button
                  key={p.name}
                  onClick={() => doNightAction(p.name)}
                  className={`text-xs font-mono px-3 py-1.5 rounded border transition-all ${
                    myRole === ROLES.JAMMER
                      ? "border-red-800/50 text-red-400 hover:bg-red-950/50 hover:border-red-600"
                      : "border-emerald-800/50 text-emerald-400 hover:bg-emerald-950/50 hover:border-emerald-600"
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {phase === PHASES.VOTE && meAlive && !selectedVote && (
          <div>
            <div className="text-xs text-amber-500/60 font-mono mb-2">
              Vote to disconnect:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {alivePlayers.map((p) => (
                <button
                  key={p.name}
                  onClick={() => castVote(p.name)}
                  className="text-xs font-mono px-3 py-1.5 rounded border border-amber-800/50 text-amber-400 hover:bg-amber-950/50 hover:border-amber-500 transition-all"
                >
                  /vote {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {(phase === PHASES.DAY ||
          (phase === PHASES.VOTE && selectedVote)) &&
          meAlive && (
            <div className="flex gap-2">
              <input
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleInput()}
                placeholder="Type a message..."
                className="flex-1 bg-black/50 border border-emerald-900/40 rounded px-3 py-1.5 text-xs font-mono text-emerald-300 placeholder-emerald-800/50 focus:outline-none focus:border-emerald-600"
              />
              <button
                onClick={handleInput}
                className="bg-emerald-800/50 text-emerald-400 text-xs font-mono px-3 rounded hover:bg-emerald-700/50"
              >
                send
              </button>
            </div>
          )}

        {phase === PHASES.RESULT && (
          <div className="flex gap-2">
            <button
              onClick={() => {
                setTab("design");
                setPhase(PHASES.LOBBY);
              }}
              className="flex-1 bg-emerald-900/30 text-emerald-500 font-mono text-xs py-2 rounded hover:bg-emerald-800/30 border border-emerald-800/30"
            >
              ← back to rules
            </button>
            <button
              onClick={startGame}
              className="flex-1 bg-emerald-700 text-black font-mono font-bold text-xs py-2 rounded hover:bg-emerald-600"
            >
              play again
            </button>
          </div>
        )}
      </div>
    </div>
  );

  // ========================
  // ROOT RENDER
  // ========================

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ fontFamily: "var(--font-mono)" }}
    >
      <div
        className="relative w-full max-w-md bg-gray-950 border border-emerald-900/40 rounded-lg overflow-hidden shadow-2xl shadow-emerald-950/50"
        style={{ height: "min(85vh, 700px)" }}
      >
        <MeshBg />

        <div className="relative z-10 flex border-b border-emerald-900/40 bg-gray-950/90">
          <button
            onClick={() => setTab("design")}
            className={`flex-1 py-2.5 text-xs font-mono uppercase tracking-widest transition-all ${
              tab === "design"
                ? "text-emerald-400 border-b-2 border-emerald-500 bg-emerald-950/20"
                : "text-emerald-700 hover:text-emerald-500"
            }`}
          >
            Design Doc
          </button>
          <button
            onClick={() => {
              setTab("play");
              if (phase === PHASES.LOBBY) startGame();
            }}
            className={`flex-1 py-2.5 text-xs font-mono uppercase tracking-widest transition-all ${
              tab === "play"
                ? "text-emerald-400 border-b-2 border-emerald-500 bg-emerald-950/20"
                : "text-emerald-700 hover:text-emerald-500"
            }`}
          >
            Play Sim
          </button>
        </div>

        <div
          className="relative z-10 overflow-y-auto"
          style={{ height: "calc(100% - 42px)" }}
        >
          {tab === "design" ? (
            <div className="p-4">
              <DesignTab />
            </div>
          ) : (
            <PlayTab />
          )}
        </div>
      </div>
    </div>
  );
}
