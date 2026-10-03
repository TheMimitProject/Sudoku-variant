// Geohash: a location as a short base-32 string. Every character you drop
// makes the area bigger, which is exactly how we offer location privacy.

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

/** Privacy levels the sender chooses. Radius is the rough half-width of the cell. */
export const PRECISION = {
  exact: { chars: 8, label: "exact", radius: "~20 m" },
  area: { chars: 6, label: "neighbourhood", radius: "~600 m" },
  city: { chars: 4, label: "city", radius: "~20 km" },
};
export const DEFAULT_PRECISION = "area";

export function encode(lat, lon, chars = 8) {
  let latR = [-90, 90], lonR = [-180, 180];
  let hash = "", bit = 0, ch = 0, even = true;
  while (hash.length < chars) {
    const r = even ? lonR : latR;
    const v = even ? lon : lat;
    const mid = (r[0] + r[1]) / 2;
    if (v >= mid) { ch = (ch << 1) | 1; r[0] = mid; } else { ch <<= 1; r[1] = mid; }
    even = !even;
    if (++bit === 5) { hash += BASE32[ch]; bit = 0; ch = 0; }
  }
  return hash;
}

/** Centre point and half-size of a geohash cell. */
export function decode(hash) {
  let latR = [-90, 90], lonR = [-180, 180], even = true;
  for (const c of String(hash).toLowerCase()) {
    const v = BASE32.indexOf(c);
    if (v < 0) throw new Error(`bad geohash "${hash}"`);
    for (let b = 4; b >= 0; b--) {
      const r = even ? lonR : latR;
      const mid = (r[0] + r[1]) / 2;
      if ((v >> b) & 1) r[0] = mid; else r[1] = mid;
      even = !even;
    }
  }
  return {
    lat: (latR[0] + latR[1]) / 2,
    lon: (lonR[0] + lonR[1]) / 2,
    latErr: (latR[1] - latR[0]) / 2,
    lonErr: (lonR[1] - lonR[0]) / 2,
  };
}

export const isGeohash = (s) => /^[0-9bcdefghjkmnpqrstuvwxyz]{3,12}$/.test(String(s || "").toLowerCase());

/** Accepts a geohash or "lat,lon". Returns a geohash at full (8-char) precision, or null. */
export function parseLocation(s) {
  const t = String(s || "").trim().toLowerCase();
  const m = t.match(/^(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (m) {
    const lat = Number(m[1]), lon = Number(m[2]);
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return encode(lat, lon, 8);
  }
  return isGeohash(t) ? t : null;
}

/** Truncate to the sender's chosen privacy level (never makes a hash more precise). */
export function coarsen(hash, precision = DEFAULT_PRECISION) {
  const n = PRECISION[precision]?.chars ?? PRECISION[DEFAULT_PRECISION].chars;
  return String(hash).slice(0, n);
}

/** Prefixes for Nostr "g" tags so viewers can query any zoom level. */
export const prefixes = (hash, min = 3) => Array.from({ length: Math.max(0, hash.length - min + 1) }, (_, k) => hash.slice(0, min + k));

/** Great-circle distance in metres. */
export function distance(a, b) {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR, dLon = (b.lon - a.lon) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
