// Shared parsing for uplink commands typed on the mesh, e.g.
//   /up sos 40.71280,-74.00600 !exact twisted ankle, east trail
//   /up report water dr5reg2 tap works at the library
//   /up sos dr5reg twisted ankle ~mg2k1a.<pub>.<sig>      (signed by the composer page)

import { parseLocation, PRECISION, DEFAULT_PRECISION } from "./geohash.js";
import { makeRecord, shortId } from "./records.js";
import { splitBlock, verifySender } from "./crypto.js";

/**
 * Parse the words after the command. Returns
 * { geo, precision, drill, note, block, error }
 */
export function parseUpArgs(args) {
  const { text, block } = splitBlock(args.join(" "));
  let words = text.split(/\s+/).filter(Boolean);
  let precision = DEFAULT_PRECISION;
  let drill = false;
  words = words.filter((w) => {
    const f = w.toLowerCase().replace(/^!/, "");
    if (w.startsWith("!") && PRECISION[f]) return (precision = f), false;
    if (w.startsWith("!") && f === "drill") return (drill = true), false;
    return true;
  });
  let geo = "";
  if (words.length) {
    // "40.7,-74.0" or "40.7, -74.0" (two words)
    const two = words.length > 1 && /,$/.test(words[0]) ? words[0] + words[1] : null;
    if (two && parseLocation(two)) {
      geo = parseLocation(two);
      words = words.slice(2);
    } else {
      // "@gcpvj2" is always a location; a bare word only counts if it has a digit
      // or a comma, so notes like "tree down" aren't read as geohashes.
      const w = words[0].replace(/^@/, "");
      const explicit = words[0].startsWith("@");
      if (words[0] === "@-") {
        words = words.slice(1); // "@-" = deliberately no location
      } else if (parseLocation(w) && (explicit || w.includes(",") || (/\d/.test(w) && w.length >= 5))) {
        geo = parseLocation(w);
        words = words.slice(1);
      }
    }
  }
  return { geo, precision, drill, note: words.join(" ").slice(0, 140), block };
}

/**
 * Build a record from parsed args. Signed messages keep their own timestamp and
 * location exactly as signed; a bad signature is an error, not a silent downgrade.
 */
export function recordFromArgs(type, parsed, { nick, now, ref, data }) {
  if (parsed.block) {
    const r = makeRecord({
      type, geo: parsed.geo, note: parsed.note, ts: parsed.block.ts, nick,
      author: parsed.block.author, sig: parsed.block.sig, drill: parsed.drill, ref, data,
    });
    if (!verifySender(r)) return { error: "signature check failed — not uploaded (was the message edited?)" };
    return { record: r, exactGeo: parsed.geo };
  }
  const record = makeRecord({ type, geo: parsed.geo, precision: parsed.precision, note: parsed.note, ts: Math.floor(now / 1000), nick, drill: parsed.drill, ref, data });
  return { record, exactGeo: parsed.geo };
}

export { shortId };
