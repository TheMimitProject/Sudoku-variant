# Proposal: opt-in uplink and local tool hook for bitchat

Draft for the bitchat maintainers · October 3, 2026 · Shamoor Bliss

## Summary

We'd love to share two small, opt-in ideas for bitchat, and we're happy to help in whatever way is most useful to you. Neither changes the wire protocol: everything rides on ordinary channel messages.

1. **A local tool hook.** An opt-in way for a companion program on the same device to read the channels a user has joined and post replies. This turns games, polls and check-in boards that currently need a human relaying messages into things that just work.
2. **An opt-in uplink.** Messages a sender marks with `/up` (an SOS with a location, an "I'm safe" check-in, a resource or hazard report) wait on the mesh until any phone with internet can forward them to a public map. Nothing leaves the mesh without `/up`.

In case it's useful, a working reference implementation, protocol spec and tests already exist (see *What already exists*).

## Why

bitchat is at its best exactly when the normal network isn't there: storms, outages, protests, festivals, remote trails. In those moments the people *on* the mesh can talk, but the people who need to know what's happening are often *off* it: family checking whether someone is safe, volunteers deciding where to send water, anyone trying to reach a person who's hurt.

Usually at least one phone in a crowd catches a bar of signal now and then. Today, getting a message from the mesh to the web means that person copying it by hand. A sender-controlled uplink lets the mesh use that occasional signal automatically, without turning bitchat into an always-online app.

The tool hook comes from the same gap. We built text games (sudoku races, social deduction, co-op minesweeper) and mesh tools (polls, check-in rosters, ping tests) that run entirely on channel messages. They work today, but only with a person acting as the bot, typing what they see into a terminal and pasting the replies back. A small local hook would remove that step for any tool, not just ours.

## Part 1: a local tool hook

The smallest useful version is a switch in settings, off by default, that lets **one local program on the same device** take part in **channels the user picks**.

| What | Proposal |
| --- | --- |
| Off by default | Enabled per channel, with a persistent indicator while it's on |
| Reads | Messages in the chosen channels: sender nick, text, timestamp |
| Writes | Messages to those channels, and private messages to nicks seen there, sent as the user and clearly labelled as coming from a tool |
| Never sees | Other channels, private messages addressed to the user, keys, contacts, location |
| Transport | Desktop: a localhost socket or stdin/stdout. Mobile: an app-extension or intent-style handoff, if feasible |
| Rate limits | A cap on tool-sent messages per minute, so a buggy tool can't flood the mesh |

That's enough to run every game and tool in our repo without a person in the loop: a host reads `/sudo play R3C5=7` and replies `✓ ghostnode: R3C5=7 (+1)`.

If a hook doesn't fit bitchat's design, the uplink in Part 2 stands on its own: it only needs the app to recognise `/up` messages and forward them.

## Part 2: an opt-in uplink

A sender puts `/up` in front of a message. Any bitchat device that has internet and has turned on **gateway mode** holds those messages and publishes them when it can reach a relay. Everyone else's app treats `/up` lines as ordinary chat.

<!-- diagram:uplink-flow -->

Only the gateway needs signal, and only for a moment; the exact location goes to named contacts, never to the public map.

### What can be uploaded

| Command | Shown on the map | Expires |
| --- | --- | --- |
| `/up sos [@location] <what>` | SOS pin | 6 h |
| `/up safe [note]` | "I'm safe", searchable by name | 24 h |
| `/up enroute [eta]` | On my way | 3 h |
| `/up report <water\|shelter\|medical\|power\|signal\|blocked\|fire\|flood\|hazard> [@location] [note]` | Resource or hazard pin | 6–24 h |
| `/up confirm <id>` · `/up resolved <id>` | Backs up a report · closes your own | — |

Locations are a geohash (`@dr5regw3`) or `lat,lon`. In an app, the location would come from the phone with the user's permission.

### Privacy is the sender's choice

| Level | Geohash | Shared publicly as |
| --- | --- | --- |
| exact | 8 chars | about 20 m |
| area (default) | 6 chars | about 600 m |
| city | 4 chars | about 20 km |

The gateway cuts the location down **before** publishing; the exact geohash never appears publicly. If the sender has named trusted contacts, those contacts get the exact location as a **NIP-17 encrypted DM**.

### Store and forward

Gateways keep a queue that survives restarts, retry every 30 seconds, drop expired items, and collapse duplicates: several gateways relaying the same message become one pin "seen by 3 gateways".

### Signed by the sender

In an app, `/up` messages would be signed with the user's existing identity key: a Schnorr signature over `meshup1|type|geohash|note|timestamp`. Gateways reject edited messages, and the map shows "✓ signed by sender". Our web composer does this today by appending a short `~timestamp.pubkey.sig` block, about 190 bytes per message in total.

### Where it goes

Uplinks are ordinary Nostr events (kind 4171), so there is no server to run:

- tags `t: meshuplink` and `t: <type>`, one `g` tag per geohash prefix (so a viewer can filter an area), NIP-40 `expiration`, a stable `rid` for de-duplication, and an optional `author` tag carrying the sender's signature;
- the event itself is signed by the gateway, so viewers can see which gateways vouched for it;
- a community can point gateways and the map at its own relay instead of public ones.

## Compatibility and safety

- **No wire protocol change.** `/up` messages and tool replies are normal channel text. Older clients show them as chat; nothing breaks.
- **Off unless chosen.** Gateway mode, the tool hook and trusted contacts are all off by default. A plain `/sos` never leaves the mesh.
- **Location is coarse by default.** About 600 m publicly; exact only to people the sender named, and only end-to-end encrypted.
- **Spoofing.** Unsigned `/up` lines could be typed by anyone using a nick, which is why in-app uploads should be signed with the user's identity key. The map labels unsigned items as "vouched for by the gateway only".
- **Abuse and noise.** SOS and reports expire (6–24 h), "resolved" only counts from the original sender, gateways can rate-limit per sender, and a `drill` flag keeps practice runs off the public map by default.
- **Public means public.** Anything sent to public relays should be treated as public and permanent; the UI should say so when someone first uses `/up`.
- **Not an emergency service.** The map and the app should say plainly that this doesn't contact emergency services.

## What already exists

Everything above runs today, outside bitchat, in [TheMimitProject/Sudoku-variant](https://github.com/TheMimitProject/Sudoku-variant) (MIT):

- **Uplink spec:** [docs/PROTOCOL-UPLINK.md](https://github.com/TheMimitProject/Sudoku-variant/blob/main/docs/PROTOCOL-UPLINK.md): commands, privacy levels, signing, event format, how the map aggregates.
- **Gateway:** `meshhost --gateway`, a Node CLI with the store-and-forward queue, a dry-run default, and `--drill`.
- **Map and composer:** a web page with a simulator, a live map from Nostr relays, find-a-person, and a phone page that uses GPS and signs messages with a key that stays in the browser.
- **Tests:** 57 automated tests, including an end-to-end run over a real relay connection in which the contact decrypts the exact location.
- **Games and tools:** Mesh Sudoku (race, territory, co-op, relay, daily), Mesh Hunt, Battleship with commit-reveal, Minesweeper co-op, Nonogram, Word Grid, polls, check-in board, scavenger hunt, ping test. All are plain text over channels; [protocol docs](https://github.com/TheMimitProject/Sudoku-variant/tree/main/docs).

The one piece we can't do from the outside is the part only bitchat can do: recognising `/up` inside the app and forwarding automatically, without a person relaying messages by hand.

## Questions for the maintainers

1. Is an opt-in uplink something you'd consider in bitchat itself, or would you rather it live in a fork or a separate app?
2. If yes: should signing reuse the existing identity key, or a separate key just for uplinks?
3. Would a local tool hook fit the project's threat model, if it's off by default and limited to channels the user picks? Desktop-only to start?
4. Is kind 4171 with `t: meshuplink` tags acceptable, or would you prefer the uplink to piggyback on something bitchat already publishes?
5. If a contribution would be welcome, which platform would suit a first pull request best, iOS/macOS or Android?

We're happy to help however suits you best: answering questions, adjusting the spec to fit bitchat's design, testing, or contributing code if that's welcome. And if this isn't a direction you want for bitchat, that's completely fine too. Thanks for building it.
