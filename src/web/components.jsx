import { useEffect, useRef, useState } from "react";

const STYLE = {
  host: "text-amber-200/90",
  dm: "text-fuchsia-300/90",
  chat: "text-sky-300/70",
  mine: "text-lime-300",
  "mine-private": "text-fuchsia-300/70",
};

function prefix(e) {
  if (e.kind === "host") return ">>> ";
  if (e.kind === "dm") return "[DM] ";
  if (e.kind === "mine-private") return "[to host] ";
  return `<${e.nick}> `;
}

/** The bitchat-style channel log. */
export function ChatLog({ log, className = "" }) {
  const ref = useRef(null);
  const stick = useRef(true);
  useEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [log]);
  return (
    <div
      ref={ref}
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      }}
      className={`overflow-y-auto px-3 py-2 text-[11.5px] leading-[1.55] ${className}`}
      aria-live="polite"
    >
      {log.map((e) => (
        <div key={e.id} className={`whitespace-pre-wrap break-words ${STYLE[e.kind] || ""}`}>
          <span className="opacity-50">{prefix(e)}</span>
          {e.text}
        </div>
      ))}
    </div>
  );
}

/** Text input that sends a command. Kept as a real component (not defined inline) so it never loses focus. */
export function CommandInput({ onSend, placeholder = "/help", draft, onDraftUsed, disabled }) {
  const [value, setValue] = useState("");
  const inputRef = useRef(null);
  useEffect(() => {
    if (draft) {
      setValue(draft);
      inputRef.current?.focus();
      onDraftUsed?.();
    }
  }, [draft, onDraftUsed]);
  const submit = (e) => {
    e.preventDefault();
    if (!value.trim()) return;
    onSend(value);
    setValue("");
  };
  return (
    <form onSubmit={submit} className="flex gap-2 p-2 border-t border-teal-900/40 bg-ink-950/60">
      <input
        ref={inputRef}
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label="message"
        className="flex-1 min-w-0 bg-ink-950 border border-teal-900/50 rounded px-3 py-2 text-xs text-lime-200 placeholder-teal-800 focus:outline-none focus:border-teal-500/70"
      />
      <button className="btn-ghost" type="submit" disabled={disabled}>
        send
      </button>
    </form>
  );
}

export function Segmented({ label, value, choices, labels, onChange }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="label">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {choices.map((c, k) => (
          <button key={String(c)} className={c === value ? "chip-on" : "chip-off"} onClick={() => onChange(c)}>
            {labels?.[k] ?? String(c)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function EndBanner({ lines, onAgain }) {
  if (!lines) return null;
  return (
    <div className="panel border-amber-400/40 bg-amber-950/20 p-4">
      {lines.map((l, k) => (
        <div key={k} className={k === 0 ? "text-amber-200 font-bold mb-1" : "text-amber-100/80 text-xs"}>
          {l}
        </div>
      ))}
      <button className="btn-primary mt-3" onClick={onAgain}>
        play again
      </button>
    </div>
  );
}

/** Stable colour per player name. */
const PALETTE = ["#f0abfc", "#93c5fd", "#fdba74", "#fca5a5", "#c4b5fd", "#fde68a", "#86efac", "#67e8f9"];
const FIXED = { ghostnode: 0, rf_witch: 1, blewalker: 2, meshpunk: 3, zerohop: 4, nostr_kid: 5, staticnoise: 6 };
export function nickColor(nick) {
  if (nick === "you") return "#bef264";
  if (FIXED[nick] != null) return PALETTE[FIXED[nick]];
  let h = 0;
  for (const ch of String(nick)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
