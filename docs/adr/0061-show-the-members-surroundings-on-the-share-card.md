# 0061. Show the member's surroundings on the share card

- **Status:** Accepted
- **Date:** 2026-10-25
- **Deciders:** Andy Moesch

## Context

ADR 0059 kept every network picture off the share card, to be safe. The
maintainer wants the card to show where the member stands: their own dot
vivid, the network around it fading away, and on the card's story the same
view turning.

## Decision

- **The card shows the member's surroundings** in its bottom-right corner:
  the replay's own layout, centred on their dot, the other dots and lines
  fading in colour and opacity with distance until invisible.
- **Only what the replay already shows the member.** Dots are anonymous
  positions (R-NET-3), and the member's own lines are there only when the
  replay would draw them (R-NET-13), since the view is drawn from the same
  timeline.
- **Drawn flat, in the browser, from the layout.** A small projection on the
  card's canvas rather than a 3D render: the same picture on every device,
  and the story turns it by changing one angle.

## Alternatives considered

- **A capture of the 3D scene** — depends on the device's graphics and the
  moment, and cannot be tested.
- **No network at all** (ADR 0059) — safe, but the maintainer finds the card
  says less about the movement without it.

## Consequences

- A member with few connections shows a lone bright dot among faint ones;
  their lines stay out of the picture, as in the replay.
- Someone who knows the network well could recognise a shape; the dots carry
  no names, the fading hides all but the nearest, and the member chooses
  whether to share.

## References

Requirements: `R-RECAP-5`, `R-NET-3`, `R-NET-13`. ADRs: 0057, 0059.
