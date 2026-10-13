# 0052. Summarise each matches section in a sentence, its cards on a tap

- **Status:** Accepted
- **Date:** 2026-10-13
- **Deciders:** Andy Moesch

## Context

ADR 0048 showed the first entry of each matches section and folded the rest.
One peer card per section is still a card: with the challenge above them, the
three sections of a challenge's matches do not fit on a phone screen, and the
founders want the screen to read as an overview (R-ASK-15). The challenge
itself was shown as loose text, unlike the card the cockpit shows it as.
Whether a sentence leads more members to connect than a card is not known.

## Decision

- **A sentence per section, as the treatment of an experiment.** The summary
  layout is the treatment of `matches_layout` (ADR 0051, R-ASK-16); 0048's
  first card stays as its control until the founders pick one.
- **The sentence.** Each non-empty section reads as one sentence: the names of
  its first `limits.matchesNamedFirst` entries (two), most relevant first, and
  how many others there are — _Ana Diaz, Ben Ortiz and 7 others are in the same
  boat_. A _Read more_ control ends it and shows the section's cards in place;
  _Show fewer_ folds them again. Case studies are named by their organisation.
- **The challenge as its card.** In the summary layout, the matches screen
  shows the member's challenge as the cockpit's challenge card.
- **Outcomes measured:** `matches_section_opened` (which section) and
  `match_connect_tapped` (which kind), beside the existing
  `connection_requested`.

## Alternatives considered

- **A screen per section** (`/challenges/:id/matches/same-boat`) — a URL to
  share, but two routes and a back step for what a tap in place does.
- **Replace the first card outright** — gives up the comparison the founders
  asked for.

## Consequences

- In the summary layout, connecting takes one more tap: _Read more_, then
  _Connect_.
- A rebel who arrives while a section is folded changes its sentence, not an
  outlined card; the outline shows once the section is opened (R-NAV-12).
- Without the limits, as when the configuration cannot be read, every card
  shows in either layout.
- Once a layout is picked, the other, the experiment and the two events are
  removed in one change.

## References

Requirements: `R-ASK-12`, `R-ASK-13`, `R-ASK-15`, `R-ASK-16`, `R-NAV-12`,
`R-EXP-1`. Spec sections: `specs/design.md` S8, §7. Amends ADR 0048.
