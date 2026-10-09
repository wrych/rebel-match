# 0048. Show the most relevant match first, ranked behind one seam

- **Status:** Accepted
- **Date:** 2026-10-09
- **Deciders:** Andy Moesch, Pascal Dulex

## Context

The founders' review of 2026-10-09 found the matches view long: every peer and
every case study is listed, so getting an overview takes scrolling. They asked
for each section to show its most relevant entry, with the rest a tap away.

"Most relevant" had no definition. Same-boat peers came newest challenge first
only because the query said so; been-there peers came in alphabetical order;
and an offer carried no date to order by. How to rank matches is the part most
likely to change after the beta, as the trend matcher is (ADR 0010).

## Decision

- **One ranker, passed in.** A pure `MatchRanker` orders each peer section; the
  challenge service receives it like any other dependency, and the store
  returns peers unordered, each with when it entered the trend.
- **Newest first, for now.** The beta's ranker puts the latest challenge and
  the latest been-there offer first. Offers gain a `created_at` to make that
  possible; offers made before it share the migration's time and fall back to
  the name.
- **The first, then the rest.** Each section shows its first
  `limits.matchesShownFirst` entries (one) and a control naming how many more
  there are, which shows them in place. Case studies keep their curated order.

## Alternatives considered

- **Collapsible sections, all closed** — an overview, but every section takes a
  tap before it shows anyone; the founders preferred a person up front.
- **Order in the SQL, as before** — no seam: a new ranking means rewriting the
  store's queries and their tests.

## Consequences

- Replacing the ranking touches `compose.ts` and a new module, nothing else.
- The ranker sees the viewer's challenge, so a smarter one can compare it with
  each peer's; it must still never see or return a contact detail (R-CONN-6).
- Existing offers rank by name until members make new ones.

## References

Requirements: R-ASK-8, R-ASK-12, R-ASK-15. Follows ADR 0010's seam for the
trend matcher. Spec: `specs/design.md` §2 (member_expertise), §5a.
