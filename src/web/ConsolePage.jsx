import { useMemo, useState } from "react";
import { CATALOG, byId, defaultOptions } from "../catalog.js";
import { useMeshSession } from "./useMeshSession.js";
import { ChatLog, CommandInput, Segmented, EndBanner } from "./components.jsx";

// Every game and tool, played the way it really runs on bitchat: as text.
const STARTERS = {
  poll: "/poll new 2m Where do we regroup? | north gate | food court | car park",
  pingtest: "/probe start 8",
  scavenger: "/clue",
  checkin: "/roster",
  battleship: "/fleet auto",
  minesweeper: "/dig E5",
  wordgrid: "/word ",
  nonogram: "/nono fill R1C1",
};

function Session({ entry, options }) {
  const [draft, setDraft] = useState(STARTERS[entry.module.id] || null);
  const { session, view, log, send, reset, paused, togglePause } = useMeshSession(entry.module, options, {
    bots: entry.bots,
    botDelay: entry.module.id === "pingtest" ? [1500, 3000] : [2500, 6000],
  });
  if (!session) return null;
  const cmds = entry.module.commands.filter((c) => !c.hidden);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
      <div className="panel flex flex-col h-[600px] min-h-0">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-teal-900/40">
          <span className="label">{entry.module.channel} · simulated mesh</span>
          <button className="chip-off ml-auto" onClick={togglePause}>{paused ? "resume bots" : "pause bots"}</button>
          <button className="chip-off" onClick={reset}>restart</button>
        </div>
        <ChatLog log={log} className="flex-1 min-h-0" />
        <div className="flex flex-wrap gap-1.5 px-2 pt-2">
          {cmds.map((c) => (
            <button key={c.name} className="chip-off" title={c.desc} onClick={() => setDraft(`/${(c.usage || c.name).split(" | ")[0]}`)}>
              /{c.usage || c.name}
            </button>
          ))}
        </div>
        <CommandInput onSend={send} draft={draft} onDraftUsed={() => setDraft(null)} />
      </div>

      <div className="flex flex-col gap-4 min-w-0">
        <EndBanner lines={session.ended ? session.endLines : null} onAgain={reset} />
        {view?.lines && (
          <div className="panel p-4 overflow-x-auto">
            <div className="label mb-2">live board{view.lives != null ? ` · ${"♥".repeat(view.lives)}` : ""}</div>
            <pre className="text-[13px] leading-[1.45] text-teal-100">{view.lines.join("\n")}</pre>
          </div>
        )}
        <div className="panel p-4 text-xs text-teal-400 leading-relaxed">
          <div className="label mb-2">commands</div>
          {cmds.map((c) => (
            <div key={c.name} className="mb-1">
              <span className="text-teal-200">/{c.usage || c.name}</span> <span className="text-teal-600">— {c.desc}</span>
            </div>
          ))}
          <div className="mt-3 text-teal-600">
            Host it for real: <code className="text-teal-300">npm run host -- {entry.module.id}</code>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ConsolePage({ id, onPick }) {
  const entry = byId[id] && id !== "sudoku" && id !== "daily" && id !== "hunt" ? byId[id] : null;
  const [opts, setOpts] = useState({});
  const options = useMemo(() => (entry ? { ...defaultOptions(entry), ...(opts[entry.module.id] || {}) } : {}), [entry, opts]);
  const groups = [...new Set(CATALOG.map((e) => e.group))];

  return (
    <div className="flex flex-col gap-5">
      <nav className="flex flex-wrap gap-x-8 gap-y-3" aria-label="games and tools">
        {groups.filter((g) => g !== "Sudoku").map((g) => (
          <div key={g} className="flex flex-col gap-1.5">
            <span className="label">{g}</span>
            <div className="flex flex-wrap gap-1.5">
              {CATALOG.filter((e) => e.group === g && e.module.id !== "hunt").map((e) => (
                <button key={e.module.id} className={entry?.module.id === e.module.id ? "chip-on" : "chip-off"} onClick={() => onPick(e.module.id)}>
                  {e.module.name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {!entry ? (
        <div className="panel p-6 text-sm text-teal-400 leading-relaxed max-w-2xl">
          Pick a game or tool above. These run exactly as they would on a real bitchat channel — plain text commands, a host replying
          with <span className="text-amber-200">&gt;&gt;&gt;</span> lines, and simulated players on the mesh.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-6">
            <div>
              <h2 className="text-xl font-black text-teal-100">{entry.module.name}</h2>
              <p className="text-xs text-teal-500">{entry.module.summary} · {entry.players} players</p>
            </div>
            {entry.options.map((o) => (
              <Segmented
                key={o.key}
                label={o.label}
                value={options[o.key]}
                choices={o.choices}
                labels={o.labels}
                onChange={(v) => setOpts((p) => ({ ...p, [entry.module.id]: { ...(p[entry.module.id] || {}), [o.key]: v } }))}
              />
            ))}
          </div>
          <Session key={entry.module.id} entry={entry} options={options} />
        </>
      )}
    </div>
  );
}
