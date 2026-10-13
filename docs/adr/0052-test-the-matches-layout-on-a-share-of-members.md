# 0052. Test the matches layout on a share of members, chosen by their id

- **Status:** Accepted
- **Date:** 2026-10-13
- **Deciders:** Andy Moesch

## Context

ADR 0051 replaced the first card of each matches section with a sentence and a
_Read more_. It makes the screen an overview, and costs a tap before anyone can
connect. Which of the two leads more members to connect is not known, and the
founders want to find out before they pick one (R-ASK-16). The app has no
experiments yet; usage data reaches Mixpanel only from the server, and only for
members who opted in (ADR 0026).

## Decision

- **Two layouts, both kept.** _Cards_ is the screen before ADR 0051; _summary_
  is ADR 0051's. The client renders whichever the matches response names.
- **Chosen by the member's id.** The server hashes a fixed experiment key with
  the member's id and shows _summary_ when the hash, taken modulo 100, is below
  `limits.matchesSummaryPercent` (50). Nothing is stored: the same member gets
  the same layout on every device, and assignment needs no consent because it
  records nothing.
- **A host moves the share.** The percentage is a changeable setting (R-CFG-6,
  ADR 0031). Setting it to 0 or 100 ends the test for everyone without a
  deploy; raising it moves members only from _cards_ to _summary_.
- **Measured with three UI events**, each carrying the layout: `matches_viewed`,
  `matches_section_opened` and `match_connect_tapped`. A Mixpanel funnel from
  `matches_viewed` to `match_connect_tapped`, broken down by `layout`, is the
  comparison; `connection_requested` follows as before.

## Alternatives considered

- **A stored assignment per member** — the same effect with a column, a
  migration and a backfill.
- **A feature-flag service** (Mixpanel experiments, GrowthBook) — a script or
  vendor in the browser, which ADR 0026 rules out, for one test.
- **A switch, one layout for everyone at a time** — compares two different
  weeks, not two groups in the same week.

## Consequences

- At summit scale (about 350 members, fewer of them opted in and fewer still
  with a challenge) only a large difference will show; a small one will not be
  told apart from chance.
- A host who lowers the share moves members back to _cards_ mid-test, and
  their earlier events count for the other layout.
- Once a layout is picked, the other one, the setting and the three events
  are removed in one change, and R-ASK-15 and R-ASK-16 say which stayed.

## References

Requirements: `R-ASK-15`, `R-ASK-16`, `R-ANA-1`, `R-ANA-3`, `R-ANA-4`,
`R-CFG-6`. Spec sections: `specs/design.md` §7, S8. Amends ADR 0051.
