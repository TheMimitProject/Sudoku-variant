import { Suspense, lazy, useEffect, useState } from "react";
import SudokuPage from "./SudokuPage.jsx";
import HuntPage from "./HuntPage.jsx";

// The console pulls in every game (and Word Grid's dictionary), so it loads on demand.
const ConsolePage = lazy(() => import("./ConsolePage.jsx"));

const read = () => {
  const [page = "sudoku", id = null] = window.location.hash.replace(/^#\/?/, "").split("/");
  return { page, id };
};

const TABS = [
  ["sudoku", "Mesh Sudoku"],
  ["hunt", "Mesh Hunt"],
  ["more", "More games & tools"],
  ["host", "Host it for real"],
];

function HostGuide() {
  return (
    <div className="panel p-6 max-w-3xl text-sm text-teal-300 leading-relaxed space-y-4">
      <h2 className="text-xl font-black text-teal-100">Playing over a real bitchat mesh</h2>
      <p>
        bitchat has no bot API, so one player hosts with <code className="text-amber-200">meshhost</code> running next to their phone. Type the
        messages you see as <code className="text-amber-200">nick: text</code>; paste back the lines it prints. <code className="text-amber-200">&gt;&gt;&gt;</code> lines
        go to the channel, <code className="text-amber-200">/msg nick …</code> lines go privately.
      </p>
      <pre className="bg-ink-950 border border-teal-900/40 rounded p-4 text-xs text-teal-100 overflow-x-auto">{`git clone https://github.com/TheMimitProject/Sudoku-variant
cd Sudoku-variant && npm install

npm run host -- list
npm run host -- sudoku --mode territory --difficulty hard
npm run host -- hunt
npm run host -- sudoku --bots 3     # practice against simulated players

ghostnode: /sudo play R3C5=7        # ← what you type
>>> ✓ ghostnode: R3C5=7 (+1)        # ← what you paste into #sudoku`}</pre>
      <h3 className="font-bold text-teal-100">No host at all</h3>
      <p>
        Every puzzle has an id like <code className="text-amber-200">9.medium.482913</code>. Anyone can regenerate it and check moves offline with{" "}
        <code className="text-amber-200">npm run host -- verify 9.medium.482913 R3C5=7</code>. The Daily Mesh Puzzle needs no host: the date is the seed, and
        posted times carry a proof hash anyone who solved it can check. Battleship fleets are committed by hash up front and audited at the end.
      </p>
      <h3 className="font-bold text-teal-100">Why it fits the mesh</h3>
      <p>
        Every action is one short message (a move is ~20 bytes; the full board code is 81 characters). Turn-based phases absorb multi-hop delay, and
        late joiners get a two-line sync instead of a wall of text.
      </p>
    </div>
  );
}

export default function App() {
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const go = (page, id) => (window.location.hash = `/${page}${id ? `/${id}` : ""}`);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <header className="flex flex-wrap items-end gap-x-8 gap-y-4 mb-6">
        <div>
          <div className="label">bitchat · bluetooth mesh · no internet</div>
          <h1 className="text-3xl font-black tracking-tight text-teal-100">
            mesh<span className="text-teal-400">/</span>sudoku
          </h1>
        </div>
        <nav className="flex flex-wrap gap-1 sm:ml-auto" aria-label="sections">
          {TABS.map(([k, label]) => (
            <button
              key={k}
              onClick={() => go(k)}
              className={`text-xs px-3 py-2 rounded border-b-2 transition-colors ${
                route.page === k ? "border-teal-400 text-teal-100 bg-teal-900/20" : "border-transparent text-teal-600 hover:text-teal-300"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <main>
        {route.page === "hunt" ? (
          <HuntPage />
        ) : route.page === "more" ? (
          <Suspense fallback={<div className="text-xs text-teal-600">loading games…</div>}>
            <ConsolePage id={route.id} onPick={(id) => go("more", id)} />
          </Suspense>
        ) : route.page === "host" ? (
          <HostGuide />
        ) : (
          <SudokuPage />
        )}
      </main>

      <footer className="mt-10 text-[11px] text-teal-700 flex flex-wrap gap-4">
        <span>Simulated players run in your browser. Nothing is sent anywhere.</span>
        <a className="hover:text-teal-400" href="https://github.com/permissionlesstech/bitchat" target="_blank" rel="noreferrer">bitchat ↗</a>
        <a className="hover:text-teal-400" href="https://github.com/TheMimitProject/Sudoku-variant" target="_blank" rel="noreferrer">source ↗</a>
      </footer>
    </div>
  );
}
