import { marked } from "marked";
import source from "../../docs/PROPOSAL-UPSTREAM.md?raw";

// The draft proposal to the bitchat maintainers, rendered from docs/PROPOSAL-UPSTREAM.md
// so the repo file and this page never drift apart.

const MARKER = "<!-- diagram:uplink-flow -->";
const [before, after] = source.split(MARKER);
const html = (md) => ({ __html: marked.parse(md || "", { gfm: true }) });

/** The uplink flow: sender → mesh → gateway → relays → map / contacts. */
function UplinkFlow() {
  const W = 150, H = 64, rowA = 104, rowB = 210;
  const box = (cx, cy, main) => (
    <rect x={cx - W / 2} y={cy - H / 2} width={W} height={H} rx="8" className={main ? "fill-teal-400/15 stroke-teal-300" : "fill-transparent stroke-teal-700"} strokeWidth={main ? 2 : 1.25} />
  );
  const label = (cx, cy, name, line, main) => (
    <>
      <text x={cx} y={cy - 4} textAnchor="middle" fontWeight="600" className="fill-teal-50">{name}</text>
      <text x={cx} y={cy + 15} textAnchor="middle" fontSize="11.5" className={main ? "fill-teal-100" : "fill-teal-500"}>{line}</text>
    </>
  );
  return (
    <figure className="my-6">
      <svg viewBox="0 0 760 266" role="img" aria-label="A /up message waits on the mesh until any gateway gets signal" fontSize="13" className="w-full font-mono">
        <defs>
          <marker id="proposal-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" className="fill-teal-600" />
          </marker>
        </defs>
        <text x="24" y="34" fontSize="15" fontWeight="600" className="fill-teal-50">A /up message waits on the mesh until any gateway gets signal</text>
        <g fill="none" className="stroke-teal-600" strokeWidth="1.25">
          <path d="M174 104H202" markerEnd="url(#proposal-arrow)" />
          <path d="M354 104H382" markerEnd="url(#proposal-arrow)" />
          <path d="M534 104H562" markerEnd="url(#proposal-arrow)" />
          <path d="M670 136V176" markerEnd="url(#proposal-arrow)" />
          <path d="M600 136V157H459V176" markerEnd="url(#proposal-arrow)" />
        </g>
        {box(99, rowA)}{label(99, rowA, "Sender's phone", "/up sos, signed")}
        {box(279, rowA)}{label(279, rowA, "Mesh", "relays hop to hop")}
        {box(459, rowA, true)}{label(459, rowA, "Gateway", "queues until online", true)}
        {box(639, rowA)}{label(639, rowA, "Nostr relays", "public or your own")}
        {box(459, rowB)}{label(459, rowB, "Public web map", "~600 m by default")}
        {box(639, rowB)}{label(639, rowB, "Trusted contacts", "exact, encrypted DM")}
      </svg>
    </figure>
  );
}

export default function ProposalPage() {
  return (
    <div className="max-w-3xl">
      <div className="panel p-4 mb-6 text-xs text-teal-400 leading-relaxed">
        <span className="label block mb-1">draft · not yet posted</span>
        A proposal to the bitchat maintainers to build the uplink and a tool hook into the app itself. Comments welcome on{" "}
        <a className="text-teal-200 underline" href="https://github.com/TheMimitProject/Sudoku-variant/blob/main/docs/PROPOSAL-UPSTREAM.md" target="_blank" rel="noreferrer">
          GitHub
        </a>
        .
      </div>
      <article className="proposal">
        <div dangerouslySetInnerHTML={html(before)} />
        {after != null && <UplinkFlow />}
        <div dangerouslySetInnerHTML={html(after)} />
      </article>
    </div>
  );
}
