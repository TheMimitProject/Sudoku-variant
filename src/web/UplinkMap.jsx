import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { TYPES } from "../uplink/records.js";
import { decode } from "../uplink/geohash.js";
import { shortId } from "../uplink/records.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function ago(sec) {
  if (sec < 90) return `${Math.max(0, Math.round(sec))}s ago`;
  if (sec < 5400) return `${Math.round(sec / 60)} min ago`;
  return `${Math.round(sec / 3600)} h ago`;
}

function popupHtml(it) {
  const r = it.record;
  const t = TYPES[r.type];
  const lines = [
    `<b>${t.icon} ${esc(t.label)}</b>${r.drill ? " <i>(drill)</i>" : ""}${it.resolved ? " <i>— resolved</i>" : ""}`,
    r.note ? `“${esc(r.note)}”` : "",
    `${esc(r.nick || "unknown")} · ${ago(it.age)} · id ${shortId(r.id)}`,
    `location ±${r.precision === "exact" ? "20 m" : r.precision === "city" ? "20 km" : "600 m"}`,
    `${it.gateways || 1} gateway${it.gateways > 1 ? "s" : ""}${it.confirms ? ` · ${it.confirms} confirmation${it.confirms > 1 ? "s" : ""}` : ""}`,
    r.author ? (r.senderVerified !== false ? "✓ signed by sender" : "✗ sender signature invalid") : "unsigned (vouched for by the gateway)",
  ];
  return lines.filter(Boolean).join("<br>");
}

/**
 * Leaflet map of aggregated uplink items. Coarse locations are drawn as the
 * whole geohash cell, so the map never pretends to know more than was shared.
 */
export default function UplinkMap({ items, height = 460, fitKey }) {
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const fitted = useRef(null);

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([40.73, -73.99], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (!map.current) return;
    layer.current.clearLayers();
    const bounds = [];
    for (const it of items) {
      const r = it.record;
      if (!r.geo) continue;
      const p = decode(r.geo);
      const t = TYPES[r.type];
      const faded = it.expired || it.resolved;
      if (r.geo.length < 8) {
        L.rectangle(
          [
            [p.lat - p.latErr, p.lon - p.lonErr],
            [p.lat + p.latErr, p.lon + p.lonErr],
          ],
          { color: t.color, weight: 1, opacity: faded ? 0.25 : 0.7, fillOpacity: faded ? 0.04 : r.type === "sos" ? 0.18 : 0.1 }
        ).addTo(layer.current);
      }
      const icon = L.divIcon({
        className: "",
        html: `<div class="uplink-pin${r.type === "sos" && !faded ? " uplink-pulse" : ""}" style="--c:${t.color};opacity:${faded ? 0.4 : 1}">${t.icon}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });
      L.marker([p.lat, p.lon], { icon, zIndexOffset: r.type === "sos" ? 1000 : 0 }).bindPopup(popupHtml(it)).addTo(layer.current);
      bounds.push([p.lat - p.latErr, p.lon - p.lonErr], [p.lat + p.latErr, p.lon + p.lonErr]);
    }
    // Fit once per data source, not on every update (so panning sticks).
    if (bounds.length && fitted.current !== fitKey) {
      map.current.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
      fitted.current = fitKey;
    }
  }, [items, fitKey]);

  return <div ref={el} className="rounded-lg overflow-hidden border border-teal-900/40 uplink-map" style={{ height }} role="region" aria-label="uplink map" />;
}
