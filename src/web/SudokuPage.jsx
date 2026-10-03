import { useCallback, useEffect, useMemo, useState } from "react";
import sudoku, { MODES } from "../games/sudoku.js";
import daily from "../games/daily.js";
import { cellName } from "../engine/commands.js";
import { useMeshSession, ME } from "./useMeshSession.js";
import { ChatLog, CommandInput, Segmented, EndBanner, nickColor } from "./components.jsx";

const MODE_INFO = {
  race: { bots: 3, blurb: "First correct answer claims the cell. Wrong guess: −1 and a 3s cooldown." },
  territory: { bots: 3, blurb: "Race rules, plus whoever claims most of a box when it fills gets +3." },
  blind: { bots: 2, blurb: "Co-op. Each player knows only some givens (the rest show as ?). Pass them with /sudo pass." },
  relay: { bots: 5, blurb: "Two teams of three. You own one band of rows and only see its givens. Fastest team wins." },
  daily: { bots: 3, blurb: "Same puzzle for everyone today, no host. Solve it on your device, then post your time with a proof." },
};

const COMMANDS = {
  race: ["/sudo play R3C5=7", "/sudo show", "/sudo code", "/sudo score", "/sudo seed"],
  territory: ["/sudo play R3C5=7", "/sudo show", "/sudo score"],
  blind: ["/sudo play R3C5=7", "/sudo pass @nick R3C5", "/sudo show", "/sudo score"],
  relay: ["/sudo play R3C5=7", "/sudo pass @nick R3C5", "/sudo show", "/sudo score"],
  daily: ["/daily play R3C5=7", "/daily done", "/daily board", "/daily verify @nick <proof>"],
};

function Grid({ view, selected, onSelect }) {
  const { size, box, cells } = view;
  const [bh, bw] = box;
  const big = size === 9;
  return (
    <div
      className="grid select-none border-2 border-teal-500/50 rounded-md overflow-hidden shadow-[0_0_40px_rgba(45,212,191,0.07)]"
      style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`, width: big ? "min(100%, 468px)" : "min(100%, 360px)", aspectRatio: "1" }}
      role="grid"
      aria-label="sudoku board"
    >
      {cells.map((c, i) => {
        const r = Math.floor(i / size), col = i % size;
        const isSel = selected === i;
        const outOfBand = view.bands && !view.bands.includes(c.band);
        const owner = view.captured?.[c.box];
        const text = c.hiddenGiven ? "?" : c.v || "";
        let color = "#5f9ea0";
        if (c.given && !c.hiddenGiven) color = "rgba(204,251,241,0.55)";
        else if (c.by) color = nickColor(c.by);
        else if (c.hiddenGiven) color = "rgba(94,234,212,0.35)";
        const borders = [
          col % bw === bw - 1 && col < size - 1 ? "border-r-2 border-r-teal-500/40" : "border-r border-r-teal-900/50",
          r % bh === bh - 1 && r < size - 1 ? "border-b-2 border-b-teal-500/40" : "border-b border-b-teal-900/50",
        ].join(" ");
        return (
          <button
            key={`${i}-${c.by || ""}-${c.v}-${c.hiddenGiven}`}
            role="gridcell"
            aria-label={`${cellName(r, col)} ${text || "empty"}`}
            onClick={() => onSelect(i)}
            className={`relative flex items-center justify-center font-bold ${big ? "text-[clamp(13px,3.6vw,22px)]" : "text-[clamp(16px,4.5vw,26px)]"} ${borders} ${
              c.by && c.by !== ME ? "flash" : ""
            } ${isSel ? "ring-2 ring-inset ring-amber-300 z-10" : ""} ${outOfBand ? "opacity-30" : ""} transition-colors hover:bg-teal-400/10`}
            style={{
              color,
              backgroundColor: c.given ? "rgba(14,32,42,0.9)" : owner ? `${nickColor(owner)}1f` : "rgba(3,8,12,0.85)",
            }}
          >
            {text}
            {c.by && c.by !== ME && <span className="absolute top-0.5 right-1 w-1 h-1 rounded-full" style={{ background: nickColor(c.by) }} />}
          </button>
        );
      })}
    </div>
  );
}

function Pad({ size, onDigit, disabled }) {
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`, width: size === 9 ? "min(100%, 468px)" : "min(100%, 360px)" }}>
      {Array.from({ length: size }, (_, k) => k + 1).map((n) => (
        <button
          key={n}
          disabled={disabled}
          onClick={() => onDigit(n)}
          className="h-11 rounded bg-ink-800 border border-teal-800/50 text-teal-100 font-bold hover:bg-teal-900/50 hover:border-teal-500/60 disabled:opacity-30 disabled:hover:bg-ink-800"
        >
          {n}
        </button>
      ))}
    </div>
  );
}

export default function SudokuPage() {
  const [mode, setMode] = useState("race");
  const [size, setSize] = useState(9);
  const [difficulty, setDifficulty] = useState("medium");
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState(null);

  const isDaily = mode === "daily";
  const options = useMemo(() => (isDaily ? {} : { mode, size, difficulty }), [isDaily, mode, size, difficulty]);
  const game = isDaily ? daily : sudoku;
  const { session, view, log, send, reset, cooldownLeft, paused, togglePause } = useMeshSession(game, options, {
    bots: MODE_INFO[mode].bots,
    botDelay: isDaily ? [2500, 6000] : mode === "relay" || mode === "blind" ? [2200, 5000] : [2600, 6000],
  });

  useEffect(() => setSelected(null), [mode, size, difficulty]);

  const place = useCallback(
    (n) => {
      if (selected == null || !view) return;
      const name = cellName(Math.floor(selected / view.size), selected % view.size);
      send(isDaily ? `/daily play ${name}=${n}` : `/sudo play ${name}=${n}`);
    },
    [selected, view, send, isDaily]
  );

  // Keyboard: digits place, arrows move, Esc clears.
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === "INPUT" || !view) return;
      const n = Number(e.key);
      if (n >= 1 && n <= view.size) return place(n);
      const moves = { ArrowUp: -view.size, ArrowDown: view.size, ArrowLeft: -1, ArrowRight: 1 };
      if (moves[e.key] != null) {
        e.preventDefault();
        setSelected((s) => Math.min(view.size * view.size - 1, Math.max(0, (s ?? 0) + moves[e.key])));
      }
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, place]);

  if (!view || !session) return null;

  const coop = mode === "blind" || mode === "relay";
  const sel = selected != null ? view.cells[selected] : null;
  const canPassSel = coop && sel?.given && !sel.hiddenGiven;
  const mates = (view.members || []).filter((m) => m !== ME);
  const standings = session.standings();

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="flex flex-col gap-4 min-w-0">
        <div className="panel p-4 flex flex-wrap gap-x-6 gap-y-3 items-end">
          <Segmented label="Mode" value={mode} choices={["race", "territory", "blind", "relay", "daily"]} onChange={setMode} />
          {!isDaily && <Segmented label="Size" value={size} choices={[9, 6]} labels={["9×9", "Mini 6×6"]} onChange={setSize} />}
          {!isDaily && <Segmented label="Difficulty" value={difficulty} choices={["easy", "medium", "hard"]} onChange={setDifficulty} />}
          <div className="flex gap-2 ml-auto">
            <button className="btn-ghost" onClick={togglePause}>{paused ? "resume bots" : "pause bots"}</button>
            <button className="btn-ghost" onClick={reset}>new puzzle</button>
          </div>
        </div>

        <p className="text-xs text-teal-400/80 leading-relaxed max-w-2xl">{MODE_INFO[mode].blurb}</p>

        <div className="flex flex-col items-center gap-3">
          <Grid view={view} selected={selected} onSelect={setSelected} />
          <div className="h-5 text-xs" aria-live="polite">
            {cooldownLeft > 0 ? (
              <span className="text-red-300">cooldown {Math.ceil(cooldownLeft / 1000)}s</span>
            ) : sel ? (
              <span className="text-teal-400">
                {cellName(Math.floor(selected / view.size), selected % view.size)}
                {sel.by ? ` · claimed by ${sel.by}` : sel.given ? (sel.hiddenGiven ? " · a given you don't know yet" : " · given") : " · type 1–" + view.size}
              </span>
            ) : (
              <span className="text-teal-700">tap a cell, then a number — or use the keyboard</span>
            )}
          </div>
          <Pad size={view.size} onDigit={place} disabled={selected == null || cooldownLeft > 0 || !!sel?.v || sel?.hiddenGiven || session.ended} />
          {canPassSel && mates.length > 0 && (
            <div className="flex flex-wrap gap-2 items-center text-xs">
              <span className="text-teal-500">pass {cellName(Math.floor(selected / view.size), selected % view.size)} to</span>
              {mates.map((m) => (
                <button key={m} className="chip-off" style={{ color: nickColor(m) }} onClick={() => send(`/sudo pass @${m} ${cellName(Math.floor(selected / view.size), selected % view.size)}`)}>
                  {m}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <aside className="flex flex-col gap-4 min-w-0">
        <EndBanner lines={session.ended ? session.endLines : null} onAgain={reset} />

        <div className="panel p-4">
          {isDaily ? (
            <>
              <div className="label mb-2">Daily {view.date} · {view.mistakes} mistakes</div>
              {view.done && !view.posted && (
                <button className="btn-primary mb-3" onClick={() => send("/daily done")}>post my time</button>
              )}
              {view.results.length === 0 && <div className="text-xs text-teal-700">no times posted yet</div>}
              {[...view.results].sort((a, b) => a.time - b.time).map((r) => (
                <div key={r.nick} className="flex items-center gap-2 text-xs py-0.5">
                  <span style={{ color: nickColor(r.nick) }} className="flex-1">{r.nick}</span>
                  <span className="tabular-nums text-teal-200">{Math.round(r.time / 1000)}s</span>
                  <span className="text-teal-600">+{r.mistakes}✗</span>
                  <button className="chip-off" disabled={!view.done} title={view.done ? "check this proof against your own solution" : "solve it first to verify"} onClick={() => send(`/daily verify @${r.nick} ${r.proof}`)}>
                    verify
                  </button>
                </div>
              ))}
            </>
          ) : coop ? (
            <>
              <div className="label mb-2">{mode === "relay" ? "Teams" : "Team"}</div>
              {view.boards.map((b) => (
                <div key={b.name} className={`text-xs py-1 ${b.name === view.boardName ? "text-teal-100" : "text-teal-500"}`}>
                  <span className="font-bold">{b.name === "main" ? "the mesh" : b.name}</span> · {b.done ? "✓ solved" : `${b.left} left`}
                  <div className="text-[11px]">
                    {b.members.map((m) => (
                      <span key={m} className="mr-2" style={{ color: nickColor(m) }}>{m}</span>
                    ))}
                  </div>
                </div>
              ))}
              <div className="text-xs text-teal-500 mt-2">
                {view.passes} passes · {view.mistakes} mistakes{view.bands ? ` · your band: ${view.bands.map((b) => b + 1).join(",")}` : ""}
              </div>
            </>
          ) : (
            <>
              <div className="label mb-2">Scores</div>
              {standings.map((p, k) => (
                <div key={p.nick} className="flex items-center gap-2 text-xs py-0.5">
                  <span className="w-4 text-teal-700">{k + 1}</span>
                  <span className="w-2 h-2 rounded-full" style={{ background: nickColor(p.nick) }} />
                  <span className="flex-1" style={{ color: nickColor(p.nick) }}>{p.nick}</span>
                  <span className="text-teal-700 text-[10px]">{String.fromCharCode(97 + (view.letters?.[p.nick] ?? 0))}</span>
                  <span className="tabular-nums text-amber-200 w-8 text-right">{p.score}</span>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="panel flex flex-col h-[420px] min-h-0">
          <div className="flex items-center justify-between px-3 py-2 border-b border-teal-900/40">
            <span className="label">{isDaily ? "#daily" : "#sudoku"} · simulated mesh</span>
          </div>
          <ChatLog log={log} className="flex-1 min-h-0" />
          <div className="flex flex-wrap gap-1.5 px-2 pt-2">
            {COMMANDS[mode].map((c) => (
              <button key={c} className="chip-off" onClick={() => setDraft(c)}>{c}</button>
            ))}
          </div>
          <CommandInput onSend={send} draft={draft} onDraftUsed={() => setDraft(null)} placeholder={COMMANDS[mode][0]} />
        </div>
      </aside>
    </div>
  );
}

export { MODES };
