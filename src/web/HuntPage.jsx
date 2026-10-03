import { useState } from "react";
import hunt, { ROLES } from "../games/hunt.js";
import { useMeshSession, ME } from "./useMeshSession.js";
import { ChatLog, CommandInput, EndBanner, Segmented, nickColor } from "./components.jsx";

const NIGHT_ACTION = { jammer: "jam", booster: "boost", scanner: "scan", signal: "relay" };
const ACTION_LABEL = {
  jam: "Choose a node to jam",
  relay: "Run a relay check through…",
  boost: "Protect a node's link",
  scan: "Scan a node's role",
};

export default function HuntPage() {
  const [players, setPlayers] = useState(6);
  const [draft, setDraft] = useState(null);
  const options = { autoStart: players, nightMs: 25000, dayMs: 45000, advanced: true };
  const { session, view, log, send, reset } = useMeshSession(hunt, options, { bots: players - 1, botDelay: [2500, 7000] });
  if (!view || !session) return null;

  const left = view.deadline ? Math.max(0, Math.ceil((view.deadline - session.now) / 1000)) : null;
  const action = view.role ? NIGHT_ACTION[view.role] : null;
  const acted = view.myNight && action ? view.myNight[action] : null;
  const others = view.order.filter((n) => n !== ME && view.alive[n]);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
      <section className="flex flex-col gap-4 min-w-0">
        <div className="panel p-4 flex flex-wrap gap-6 items-end">
          <Segmented label="Players" value={players} choices={[5, 6, 7, 8]} onChange={setPlayers} />
          <div className="text-xs text-teal-500 max-w-md leading-relaxed">
            7+ players adds a Booster (protects a link) and a Scanner (learns a role). A node jammed twice drops off the mesh.
          </div>
          <button className="btn-ghost ml-auto" onClick={reset}>new game</button>
        </div>

        <div className="panel p-5">
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="text-2xl font-black tracking-tight text-teal-100">
              {view.phase === "night" ? `🌙 Night ${view.round}` : view.phase === "day" ? `☀️ Day ${view.round}` : view.phase === "over" ? "Game over" : "Lobby"}
            </span>
            {left != null && view.phase !== "over" && <span className="text-xs text-teal-500 tabular-nums">{left}s left</span>}
            {view.roleLabel && (
              <span className="ml-auto text-sm">
                you are <b>{view.roleLabel}</b>
              </span>
            )}
          </div>

          {!view.meAlive && view.phase !== "lobby" && view.phase !== "over" && (
            <div className="mt-3 text-xs text-fuchsia-300">You've been disconnected — spectating. The game keeps going without you.</div>
          )}

          {view.meAlive && view.phase === "night" && (
            <div className="mt-4">
              <div className="label mb-2">{acted ? `locked in: ${acted}` : ACTION_LABEL[action]}</div>
              <div className="flex flex-wrap gap-2">
                {others
                  .filter((n) => !(view.role === "jammer" && view.revealed[n] === "jammer"))
                  .map((n) => (
                    <button key={n} disabled={!!acted} className="chip-off disabled:opacity-40" style={{ color: nickColor(n) }} onClick={() => send(`/${action} ${n}`)}>
                      {n}
                    </button>
                  ))}
                {action === "relay" && !acted && (
                  <button className="chip-off" onClick={() => send("/relay skip")}>skip</button>
                )}
              </div>
            </div>
          )}

          {view.meAlive && view.phase === "day" && (
            <div className="mt-4">
              <div className="label mb-2">{view.votes[ME] ? `you voted ${view.votes[ME]} — you can change it` : "Vote to disconnect"}</div>
              <div className="flex flex-wrap gap-2">
                {others.map((n) => (
                  <button key={n} className={view.votes[ME] === n ? "chip-on" : "chip-off"} onClick={() => send(`/vote ${n}`)}>
                    /vote {n}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="panel p-4">
          <div className="label mb-3">Nodes</div>
          <div className="grid sm:grid-cols-2 gap-2">
            {view.order.map((n) => {
              const votesFor = Object.values(view.votes).filter((t) => t === n).length;
              return (
                <div key={n} className={`flex items-center gap-2 text-xs rounded border px-3 py-2 ${view.alive[n] ? "border-teal-900/50" : "border-transparent opacity-50 line-through"}`}>
                  <span className="w-2 h-2 rounded-full" style={{ background: nickColor(n) }} />
                  <span className="flex-1" style={{ color: nickColor(n) }}>{n}</span>
                  {view.jams[n] ? <span title="times jammed">📡{view.jams[n]}</span> : null}
                  {view.phase === "day" && votesFor ? <span className="text-amber-300">🗳{votesFor}</span> : null}
                  {view.revealed[n] && <span className="no-underline">{ROLES[view.revealed[n]].split(" ")[0]}</span>}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <aside className="flex flex-col gap-4 min-w-0">
        <EndBanner lines={session.ended ? session.endLines : null} onAgain={reset} />
        <div className="panel flex flex-col h-[560px] min-h-0">
          <div className="px-3 py-2 border-b border-teal-900/40 label">#meshhunt · simulated mesh</div>
          <ChatLog log={log} className="flex-1 min-h-0" />
          <div className="flex flex-wrap gap-1.5 px-2 pt-2">
            {["/vote ", "/slap ", "/who", "/sync"].map((c) => (
              <button key={c} className="chip-off" onClick={() => setDraft(c)}>{c.trim()}</button>
            ))}
          </div>
          <CommandInput onSend={send} draft={draft} onDraftUsed={() => setDraft(null)} placeholder="say something, or /vote nick" />
        </div>
      </aside>
    </div>
  );
}
