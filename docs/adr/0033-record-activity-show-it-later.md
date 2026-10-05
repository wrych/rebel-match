# 0033. Record activity in our own tables; showing it is a separate decision

- **Status:** Accepted
- **Date:** 2026-10-05
- **Deciders:** Andy Moesch

## Context

The team wants figures it can quote after the summit — how many challenges were
posted and by how many people, how often challenges were seen, how many "been
there" notes were given — and may later build features on the same data, such
as a member's recently viewed challenges, or a host dashboard.

Mixpanel already receives events (ADR 0026), so reading the figures back from
it looked natural. It is the wrong source. Events go only for members who opted
in to analytics, so every count would be "among those who ticked the box", not
a count. Those members agreed to the team studying usage, not to their events
feeding the product. And a product number would then depend on a third party's
API, key and limits.

Most figures are already in the database: challenges and their authors,
swipes, "been there" notes, connection requests. What is missing is what each
member was shown.

## Decision

- **Activity is recorded in our own tables**, as part of running the app, not
  under the analytics opt-in. Nothing recorded for it goes to Mixpanel.
- **What a member is shown is recorded per showing**: member, challenge, time,
  each time a card becomes the visible one in the swipe deck (R-STAT-1). The
  member is kept so that total views and members who saw a challenge can both
  be read, and so that features for the member can build on it later.
- **Recording is not showing.** No screen or endpoint returns these records
  (R-STAT-2). How activity is displayed — end-of-event figures, a dashboard — is
  its own decision, recorded in `tasks.md`. Whatever it is, it shows figures
  that combine many members, never what one person did.
- **Kept with the account**, erased with it (R-NFR-7, ADR 0032), and deletable
  by the member at any time from the profile, apart from the account
  (R-STAT-4). Only the views go; challenges, notes, swipes, follows and
  connections are content and decisions, not history.
- **Members are told** in the consent words, in a new version (R-STAT-5).

## Alternatives considered

- **Read the figures back from Mixpanel** — counts only the opted-in, reuses
  their consent for another purpose, and ties a product number to a third
  party.
- **A plain counter per challenge, without the member** — no personal data,
  but it cannot tell ten members from one member ten times, nor support
  anything built for the member later.
- **A retention period for views** — limits what is kept, but would cut the
  history a later feature needs. Keeping it with the account is a defined
  limit, and the member can clear it.

## Consequences

- The deck reports each card it shows; one more small request per card.
- A per-member record of what was seen is personal data held for as long as
  the account; the consent words, the erasure and the delete-history button
  are what make that acceptable.
- Every future display of activity starts from tables we own, and needs only
  its own decision about what to show and to whom, including a minimum count
  below which a figure is hidden.

## References

Amends nothing; sits beside ADR 0026. Requirements: R-STAT-1..5, R-NFR-7,
R-PROF-2, R-ANA-1..4, R-ONB-4, R-ONB-5.
