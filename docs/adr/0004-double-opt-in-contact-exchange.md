# 0004. Double opt-in before any contact detail is shared

- **Status:** Accepted
- **Date:** 2026-10-01
- **Deciders:** Andy Moesch, Ivo Pejakovic, Pascal Dulex

## Context

Members post unsolved organizational problems — the kind of thing people do not
want traced back to them casually. The prototype opened a direct `mailto:` on
"Connect", revealing an address to anyone who tapped a card. The meeting was
unambiguous that this had to change: the sharing of email addresses must be
explicit on both sides, and stated plainly up front.

## Decision

Connecting is a two-sided opt-in. A request is created pending; the target is
notified; only when they accept do both parties gain access to each other's
email address. A decline reveals nothing, permanently. The consent text at
onboarding says so in those words.

## Alternatives considered

- **Direct `mailto:` (the prototype)** — one tap, no consent. Rejected.
- **In-app messaging** — avoids sharing addresses at all, but it is a product to
  build and maintain, and members then have an inbox they will not check.
- **Requester reveals their own address first** — still one-sided, and it
  pressures the recipient.

## Consequences

- The privacy cornerstone of the product, and the hardest rule in the codebase:
  the contact endpoint checks accepted-status _and_ party membership on every
  read, and an unauthorized read returns not-found rather than forbidden.
- Connections are slower than a `mailto:`, which is the intended trade.
- Needs its own notification path, which is what makes deep links worth having
  (ADR 0007).
- This rule is unit- and integration-tested by name (R-QA-1, R-QA-2).

## References

Requirements: R-CONN-1..6, R-NFR-1. Spec: `specs/flows.md` F7.
