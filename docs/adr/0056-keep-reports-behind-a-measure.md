# 0056. Keep the reports behind a hide or a ban while it stands

- **Status:** Accepted
- **Date:** 2026-10-21
- **Deciders:** Andy Moesch

## Context

ADR 0055 deletes every handled report after `limits.reportRetentionDays`,
whatever became of it. A report that led a host to hide a note or ban its
author is the record of why. With a flat retention it goes after 180 days
while the ban stands, and a host asked about the ban then, or the person
harassed who wants to take it further, finds nothing behind it. A dismissed
report is the opposite case: an accusation the hosts did not uphold, the
weakest reason to keep personal data. No law we know of sets a minimum time
for either. The Swiss Data Protection Act and the GDPR ask for no longer than
the purpose needs, and allow keeping data to establish or defend legal claims.

## Decision

A handled report is deleted `limits.reportRetentionDays` after it was handled,
unless a measure stands behind it: its member is banned, or its challenge or
note is hidden. Then it is kept while the measure stands, and deleted
`limits.reportRetentionDays` after the measure is lifted (the latest _Lift
ban_, or _Unhide_ of that item, in the history). Every report about a banned
member is kept, not only those the ban handled, as the ban rests on all of
them. Erasure is unchanged: the reported member's erasure takes their reports
along, at any time (R-NFR-7).

This amends ADR 0055's retention only.

## Alternatives considered

- **One retention for all handled reports** (ADR 0055) — it deletes the
  evidence for a ban while the ban still stands.
- **A longer flat retention**, such as three years for civil claims — it keeps
  every dismissed accusation that long as well, which the purpose does not
  need.
- **Linking each report to the action that handled it** — exact, but a new
  column and a backfill for what the item's state and the history already
  tell.

## Consequences

- A banned member's reports stay as long as the ban. Lifting it starts the
  clock for all of them.
- The purge reads the member's status, the item's hidden state and the
  history, so it needs no new column.
- The privacy notice has to say so (ADR 0055 already asks for its moderation
  lines).

## References

Amends ADR 0055. Requirements: R-MOD-11, R-NFR-7. Spec: `specs/design.md` §2.
