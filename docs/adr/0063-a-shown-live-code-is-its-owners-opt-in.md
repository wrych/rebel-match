# 0063. A live code shown is its owner's opt-in; a profile code only asks

- **Status:** Proposed
- **Date:** 2026-11-05
- **Deciders:** Andy Moesch

## Context

Two people talking at the summit want to connect then and there. Searching
for each other and then waiting for an accept is slow for people standing
face to face, and the double opt-in (ADR 0004) exists to protect someone who
did not choose to be contacted. Someone holding up their phone with a code
on it has chosen.

A QR code can be photographed. A code that connects at once and lives for
days would, once posted, hand its owner's email address to anyone who scans
it.

## Decision

Each member has two codes, on one screen, `/me/code`:

- A **profile code**, long-lived, leading to the member's card. Scanning it
  only lets the scanner _ask_: the request is pending and the owner accepts
  or declines (ADR 0004). It can be shared, copied, turned off and reset.
  Its token is kept as is, like an invite's (ADR 0014), so it can be drawn
  again.
- A **live code**, which connects at once. Showing it is the owner's opt-in,
  scanning it the scanner's. It is replaced on the screen every
  `limits.liveCodeSeconds`, with a ring counting down as an authenticator
  does, and stays usable `limits.liveCodeGraceSeconds` after its successor
  appears, so a scan begun at the end still works. It is single-use, stored
  hashed, never offered to copy or share, and not issued while the page is
  hidden.

Both are behind `limits.connectCodes`. A signed-out scanner of a live code is
asked to sign in, and the token is not kept: it will have expired. Neither
code admits a non-member; that stays the invites' job.

## Alternatives considered

- **One long-lived code that connects at once** — a photo of it is a
  standing open door to the owner's address.
- **A live code that only asks** — no faster than search, and the owner is
  standing right there to accept.
- **Both scan each other, accept when both requested** — consent from both,
  but two scans and two screens in a hallway; the live code needs one.
- **The member's id in the code** — not revocable; a code must be resettable
  without changing who the member is.
- **No grace** — a scan at the last second fails, and the person with the
  slower camera always loses.
- **Draw the QR on the server** — an image endpoint and its caching for
  something a small library draws in the browser, loaded only on this screen.

## Consequences

- ADR 0004's "a request is created pending" now has one exception, and it is
  this one: a live code redeemed within its time. R-CONN-1 says so.
- A photographed live code is usable for at most
  `liveCodeSeconds + liveCodeGraceSeconds`, and only once. Hosts can shorten
  both.
- The owner learns who connected on the code screen and by the R-CONN-9
  notification; the scanner lands on the contact screen.
- Codes are deleted with their member and stop working on a ban or a
  deletion request.
- A new client dependency, `uqr`, in its own chunk.

## References

Requirements: R-CODE-1..10, R-CONN-1, R-CONN-8, R-CONN-9. ADR 0004, ADR 0014,
ADR 0049. Spec: `specs/flows.md` F26; `specs/design.md` §1, §2, §3, §4.
