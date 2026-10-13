# 0051. Summarise each matches section in a sentence, its cards on a tap

- **Status:** Accepted, amended by 0052
- **Date:** 2026-10-12
- **Deciders:** Andy Moesch

## Context

ADR 0048 showed the first entry of each matches section and folded the rest.
One peer card per section is still a card: with the challenge above them, the
three sections of a challenge's matches do not fit on a phone screen, and the
founders want the screen to read as an overview (R-ASK-15). The challenge
itself was shown as loose text, unlike the card the cockpit shows it as.

## Decision

- **A sentence per section.** Each non-empty section reads as one sentence:
  the names of its first `limits.matchesNamedFirst` entries (two), most
  relevant first, and how many others there are — _Ana Diaz, Ben Ortiz and 7
  others are in the same boat_. A _Read more_ control ends it and shows the
  section's cards in place; _Show fewer_ folds them again. Case studies are
  named by their organisation.
- **The challenge as its card.** The matches screen shows the member's
  challenge as the cockpit's challenge card, one component for both.
- This replaces 0048's "the first, then the rest";
  `limits.matchesShownFirst` becomes `limits.matchesNamedFirst`.

## Alternatives considered

- **A screen per section** (`/challenges/:id/matches/same-boat`) — a URL to
  share, but two routes and a back step for what a tap in place does.
- **Keep the first card** — the screen still scrolls before it shows the case
  studies.

## Consequences

- Connecting takes one more tap: _Read more_, then _Connect_.
- A rebel who arrives while a section is folded changes its sentence, not an
  outlined card; the outline shows once the section is opened (R-NAV-12).
- Without the limit, as when the configuration cannot be read, every card
  shows, as before.

## References

Requirements: `R-ASK-12`, `R-ASK-13`, `R-ASK-15`, `R-NAV-12`. Spec sections:
`specs/design.md` S8. Amends ADR 0048.
