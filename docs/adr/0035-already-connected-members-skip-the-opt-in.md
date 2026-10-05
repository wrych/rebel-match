# 0035. Members already connected skip the opt-in for each further challenge

- **Status:** Accepted
- **Date:** 2026-10-05
- **Deciders:** Andy Moesch

## Context

The double opt-in (ADR 0004) runs per request, and a request is about one
challenge. Two members who connected over one challenge and then meet again in
the deck or on a matches view had to ask, and answer, all over again; each
accepted request then showed as a separate connection, so the same person
filled the cockpit once per challenge. Both had already agreed to share their
addresses with each other, so the second answer protected nothing.

## Decision

A request between two members who already share an accepted request, in either
direction, is stored accepted at once. The requester goes straight to the
contact screen; the target is told in-app and by email, as a requester is when
their request is accepted. A request about a challenge the two are already
connected over adds nothing. Accepting one request accepts every other one
pending between the two, either side, for the same reason.

The cockpit shows one card per connected member. The contact screen lists
every accepted request between the two under _Connected over_. Each party has
their own "not opened yet" mark per request — the requester's since R-CONN-7,
now also the target's — which outlines, counts and raises the card.

## Alternatives considered

- **Ask again each time** — what we had: an answer that reveals nothing new,
  and a duplicate in the list for every challenge.
- **Block the second request as a duplicate** — loses the note and the
  challenge the second connection was about, which is what makes it worth
  telling the target.
- **Group only in the client** — fixes the list but keeps the pointless
  answer, and the target is never told of the new challenge.

## Consequences

- The opt-in is per pair of members, no longer per challenge. A member who
  wants no more contact from someone has no in-app way to say so, as before:
  they already have each other's address.
- The contact read is still the only read of an email, still checks accepted
  status and party membership in its query (ADR 0004).
- A new outbound kind, `connection_added`, erased with either member like the
  others (R-MSG-6).
- Two simultaneous requests about the same new challenge can both be stored;
  nothing is revealed by it, and both show under _Connected over_.

## References

Requirements: R-CONN-8, R-CONN-9, R-CONN-10, R-CONN-11, R-MINE-5, R-MINE-6. ADR 0004.
Spec: `specs/flows.md` F7, F8; `specs/design.md` §3, §4.
