# Mesh Hunt — protocol

Channel: `#meshhunt` · Players: 4–8 · Host: required (holds the secret roles)

## Roles

| Role | Count | Night action |
| --- | --- | --- |
| 🟢 Signal | the rest | `/relay <nick>` — learn at dawn whether a packet through that node got through (or `/relay skip`) |
| 🔴 Jammer | 1 (4–6 players), 2 (7–8) | `/jam <nick>` — disrupt that node's relay (65% success) |
| 🔵 Booster | 1 at 7+ (advanced) | `/boost <nick>` — that node can't be jammed tonight |
| 🟣 Scanner | 1 at 7+ (advanced) | `/scan <nick>` — learn privately whether it's a jammer |

Jammers learn each other's names. Night actions go to the host by private message, either as commands
(`/msg host /jam rf_witch`) or in the classic form (`/msg host JAM:rf_witch`).

## Flow

1. **Lobby** — players `/join`; anyone sends `/hunt start`. Roles go out by DM.
2. **Night** — everyone sends their night action. Dawn comes when all are in, or after the timer (default 60 s).
3. **Dawn** — the host reports:
   - `📡 Relay disrupted: rf_witch (1/2)` for each successful jam,
   - `⚡ … a booster held the link` if the target was boosted,
   - relay-check and scan results by DM.
   A node jammed successfully **twice** drops off the mesh and its role is revealed.
4. **Day** — discuss, then `/vote <nick>`. Votes are public and can be changed. Voting closes when every living player
   has voted, or after the timer (default 2 min).
5. **Tally** — `🗳 VOTES: darkpacket×3 rf_witch×1`. Most votes is disconnected and revealed. **Ties: nobody.**

## Winning

- Signals win when every Jammer is out.
- Jammers win when they equal or outnumber everyone else.

## Spectators

Disconnected players keep watching but can't vote or act. The game carries on without them.

## Commands

| Command | Phase | Notes |
| --- | --- | --- |
| `/hunt start` | lobby | deal roles |
| `/jam` `/relay` `/boost` `/scan` `<nick>` | night | private, to the host |
| `/vote <nick>` | day | public |
| `/slap <nick>` | any | flavour |
| `/sync` | any | your role and who's alive |
| `/hunt next` | any | host: skip the timer |

## Host

```bash
npm run host -- hunt                       # 60 s nights, 2 min days
npm run host -- hunt --nightMs 30000 --dayMs 90000 --advanced false
```
