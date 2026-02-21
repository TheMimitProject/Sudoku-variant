# Mesh Hunt — Bitchat Protocol Spec

> Social deduction over Bluetooth mesh. Find the Jammer before the mesh collapses.

## Overview

- **Players:** 4–8
- **Roles:** Signal (majority), Jammer (1 for 4–6 players, 2 for 7–8)
- **Channel:** `#meshhunt`
- **Win condition:** Signals win by voting out all Jammers. Jammer wins when Signals ≤ Jammers.
- **Average game:** 15–30 minutes

## Roles

### 🟢 Signal

Honest mesh relay nodes. Goal: identify and disconnect the Jammer through discussion and voting.

### 🔴 Jammer

Infiltrator sabotaging the mesh. Goal: survive votes and eliminate Signal nodes until the mesh collapses.

## Game Flow

### 1. Setup

One player volunteers as **host**. All players join the game channel:

```
/join #meshhunt
```

Host assigns roles via private message:

```
/msg ghostnode ROLE:signal
/msg darkpacket ROLE:jammer
/msg rf_witch ROLE:signal
...
```

Host announces game start:

```
>>> MESH HUNT started. 6 players. Night 1 begins.
```

### 2. Night Phase

The Jammer privately messages the host with their target:

```
/msg host JAM:rf_witch
```

Optionally, Signal players can send a **relay check** to test a link:

```
/msg host RELAY:darkpacket
```

The host resolves the night. The jam has a ~65% success rate (host rolls or decides).

### 3. Dawn Announcement

Host posts the result publicly:

```
>>> rf_witch's relay link was disrupted overnight.
```

Or if the jam failed:

```
>>> All relays held overnight. No interference detected.
```

### 4. Day Phase (Discussion)

Open discussion on `#meshhunt`. Typical duration: 2–3 minutes (honor system or host timer).

Players discuss, accuse, and defend:

```
<blewalker> rf_witch got jammed again... suspicious that darkpacket is never targeted
<darkpacket> I was relaying to ghostnode, link was clean
<rf_witch> someone is targeting me specifically
```

### 5. Vote Phase

Host calls for votes:

```
>>> VOTE NOW. Type /vote <username> to disconnect a node.
```

Players vote publicly:

```
/vote darkpacket
```

Host tallies and announces:

```
>>> darkpacket received 3 votes. Disconnected from the mesh.
>>> darkpacket was the 🔴 JAMMER!
>>> 🟢 SIGNALS WIN — the mesh is clean!
```

Or:

```
>>> darkpacket was a 🟢 SIGNAL node...
>>> Night 2 begins.
```

**Tie rule:** No elimination on a tie.

## Message Reference

| Command                      | Context | Description                        |
| ---------------------------- | ------- | ---------------------------------- |
| `/join #meshhunt`            | Public  | Join the game                      |
| `/msg host JAM:<target>`     | Private | Jammer selects night target        |
| `/msg host RELAY:<target>`   | Private | Signal tests a relay link          |
| `/vote <target>`             | Public  | Vote to disconnect a player        |
| `/who`                       | Public  | List alive players                 |
| `/slap <target>`             | Public  | Dramatic accusation (flavor only)  |

## Payload Sizes

All messages are under 100 bytes, well within BLE packet limits. With LZ4 compression, most are under 50 bytes.

## Advanced Variants

### Relay Booster (7+ players)

Add a **Relay Booster** role. Each night they can protect one player's link:

```
/msg host BOOST:rf_witch
```

If the Jammer targets a boosted player, the jam automatically fails.

### Scanner (7+ players)

Add a **Scanner** role. Each night they can verify one player's role:

```
/msg host SCAN:darkpacket
```

Host responds privately:

```
/msg scanner darkpacket is SIGNAL
```

### Two Jammers (7–8 players)

Jammers know each other's identity (host tells both via `/msg`). They can coordinate but must be careful — if one is caught, the other is exposed by process of elimination.

## Strategy Tips

**For Signals:**
- Track who gets jammed and who doesn't. A player who is never targeted may be the Jammer.
- Cross-reference relay checks. If your relay to X succeeded but Y's relay to X failed, that's useful data.
- Vote cautiously — eliminating a Signal helps the Jammer.

**For the Jammer:**
- Spread your attacks across different players. Targeting the same person repeatedly is suspicious.
- Accuse early and confidently. Hesitation looks guilty.
- Claim you were jammed (when you weren't) to build false trust.
- Target vocal organizers to remove the Signals' strongest deducers.
