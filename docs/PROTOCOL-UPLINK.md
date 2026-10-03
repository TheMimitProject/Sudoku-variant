# Uplink — from the mesh to the web

The uplink lets messages from a bitchat mesh reach the internet: SOS calls with a location, "I'm safe"
check-ins people outside can look up, resource and hazard reports, mesh coverage, and game results.

**Nothing leaves the mesh unless the sender marks it with `/up`.** Plain `/sos`, `/safe` and `/report` stay
on the mesh.

> This is not an emergency service. If you can reach emergency services, call them.

---

## How it flows

```
phone on the mesh ──/up sos …──▶ mesh ──▶ gateway (any device with meshhost --gateway)
                                            │  store-and-forward queue (survives restarts)
                                            ▼  when it reaches a relay
                                      Nostr relays ──▶ web map, "find a person", leaderboards
                                            └──▶ encrypted DM with the exact location to the sender's contacts
```

- **Gateway.** Any device running `npm run host -- checkin --gateway`. Without `--relays` it's a dry run that
  writes events to `~/.meshhost/uplink-outbox.jsonl`. With `--relays default` (or a list) it publishes.
- **Store and forward.** Records wait in `~/.meshhost/uplink-queue.json` until a relay accepts them, retrying every
  30 s. They're dropped once expired. `!up offline` holds everything (to save battery or data); `!up online` resumes.
- **Relays.** Uplinks are ordinary Nostr events, so there's no server to run. A community can also run its own relay:
  `npm run relay` starts a small one (`scripts/local-relay.mjs`) and the map can point at it.

## Commands on the mesh

| Command | What gets uploaded |
| --- | --- |
| `/up sos [@location] [!exact\|!area\|!city] <what>` | SOS pin (6 h) |
| `/up safe [@location] [note]` | "I'm safe" check-in (24 h) |
| `/up enroute [eta]` | on my way (3 h) |
| `/up report <type> [@location] [note]` | resource or hazard (6–24 h) |
| `/up confirm <id>` | backs up someone else's report |
| `/up resolved <id>` | closes your own SOS or report |
| `/up contact <npub>` / `/up contact clear` | who gets your exact location privately |
| `/up status` | what the gateway is holding |
| `/pong … @location` then host `/up probe` | ping-test coverage per node (24 h) |
| `/up daily` | your Daily Mesh Puzzle time and proof (48 h) |
| host `/up standings` | scavenger hunt results (24 h) |

Report types: `water` `food` `shelter` `medical` `power` `signal` `blocked` `fire` `flood` `hazard`.

**Locations** are a geohash (`@dr5regw3`) or `lat,lon` (`40.7128,-74.0060`). `@-` means "no location".
A bare word only counts as a location if it has a comma, or a digit and 5+ characters, so notes like
`2nd floor` stay notes.

Ids are shown as the first 6 characters (`id 4e36b5`); any unique prefix of 3+ works with `/up confirm` and
`/up resolved`.

## Location privacy

| Flag | Geohash | Shared publicly as |
| --- | --- | --- |
| `!exact` | 8 chars | ~20 m |
| `!area` (default) | 6 chars | ~600 m |
| `!city` | 4 chars | ~20 km |

The gateway truncates the location **before** publishing; the exact geohash never appears in a public event.
If the sender registered contacts with `/up contact`, those people also get a **NIP-17 encrypted DM** with the
exact coordinates and an OpenStreetMap link, readable in most Nostr apps.

The map draws coarse locations as the whole geohash cell, so it never looks more precise than it is.

## Signed messages

The **Send from your phone** page (Uplink map → Send from your phone) works offline once loaded. It uses the
phone's GPS, keeps a key in the browser, and builds a message like:

```
/up sos @dr5ruz !drill twisted ankle by the reservoir ~tmc8ji.<public key>.<signature>
```

The block after `~` is a timestamp, the sender's public key and a Schnorr (secp256k1) signature over
`meshup1|<type>|<geohash>|<note>|<timestamp>`. Gateways verify it and reject edited messages. On the map, signed
items show "✓ signed by sender"; unsigned ones are vouched for only by the gateway. A message is about 190 bytes.

If the phone has signal, the same page can publish directly without a gateway.

## Nostr event format

```json
{
  "kind": 4171,
  "content": "twisted ankle by the reservoir",
  "tags": [
    ["t", "meshuplink"], ["t", "sos"], ["t", "drill"],
    ["rid", "6625b8…"], ["mesh_ts", "1791041256"], ["expiration", "1791062856"],
    ["nick", "ann"], ["precision", "area"],
    ["g", "dr5"], ["g", "dr5r"], ["g", "dr5ru"], ["g", "dr5ruz"],
    ["author", "<sender pubkey hex>", "<sender signature hex>"],
    ["ref", "<rid>"], ["data", "{…}"],
    ["alt", "Mesh uplink: SOS — twisted ankle by the reservoir"]
  ]
}
```

- `pubkey` / `sig`: the gateway's key (kept in `~/.meshhost/gateway.key`).
- `rid`: stable record id. Signed records hash the signature; unsigned ones hash type, location, note, nick and a
  10-minute time bucket, so two gateways relaying the same message collapse into one pin ("seen by 2 gateways").
- `g`: every prefix from 3 characters, so a viewer can filter an area with `{"#g": ["dr5r"]}`.
- `expiration`: NIP-40; relays that support it drop the event when it lapses.
- `ref`, `data`, `author`, `drill` appear only when used.

Viewer filter: `{"kinds": [4171], "#t": ["meshuplink"], "#g": ["<area>"], "since": <48 h ago>}`.

## How the map decides what to show

- Duplicates from several gateways merge.
- `resolved` only counts when it comes from the same sender (same key, or same nick if unsigned).
- Confirmations count other people's `confirm` records plus independent reports of the same type in the same
  ~1 km cell.
- Expired, resolved and drill items are hidden by default (there are toggles).
- SOS first, then newest first.

## Limits

- bitchat has no bot API, so a gateway is a person running `meshhost` and relaying messages by hand. A fully
  automatic gateway would need support inside bitchat itself.
- Unsigned messages can be spoofed by anyone who can type a nick on the mesh; signed ones can't.
- Public relays may rate-limit or drop events. Using several relays, or your own, helps.
- Anything published to public relays should be treated as public and permanent.
