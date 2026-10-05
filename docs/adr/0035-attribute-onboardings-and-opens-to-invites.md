# 0035. Attribute onboardings and opens to the invite they came through

- **Status:** Accepted
- **Date:** 2026-10-05
- **Deciders:** Andy Moesch

## Context

Invites are printed as QR codes on posters, slides and tables (R-INV-1). The
team wants to know which codes work: how often each is opened, and how many of
those who open it finish onboarding.

Nothing records either today. Mixpanel cannot see a visitor who opens a code:
events go only for members who opted in (ADR 0026), and a visitor has not even
signed in. `onboarding_completed` reaches Mixpanel for opted-in members, but
R-ANA-3 limits its properties to trend ids, action types, screens, counts and
timestamps, so it cannot say which invite brought the member.

An invite id is not a person, but an invite made for one or two people would
make it one: a cap of 1 and a label naming someone ties the pseudonymous
member to that person.

## Decision

- **Opens are recorded in our own table**, as ADR 0033 records deck views:
  - Each time the entry screen loads with an `?invite=` token, the client tells
    the server once (`POST /auth/invite-opened`). The server records the
    invite and the time when the token names an invite, any state, and nothing
    else: no member, no address, no cookie.
  - It answers the same whatever the token, so it says nothing about which
    tokens exist, and it is counted under the per-IP sign-in limit (ADR 0029).
  - Opens are not shown or returned anywhere until a later decision, which
    `tasks.md` records. They go with the invite.
- **`onboarding_completed` names the invite** a member joined through, as
  `invite_id`, once that invite has admitted at least `analytics.inviteMinUses`
  (20) people, counted by its `uses`, not its cap: a cap says how many may
  join, not how many share the code. Until then it is left out, so an invite
  used by a few named people never reaches Mixpanel. R-ANA-3 is amended to
  allow it.

## Alternatives considered

- **Record opens on the server when it serves the page** — needs no client
  call, but counts link previews and mail scanners, and the development server
  never sees it.
- **Send opens to Mixpanel** — needs consent the visitor has not given.
- **Send `invite_id` for every invite** — ties a member to a small invite's
  people.
- **Send the invite's label** — free text a host types, which could name a
  person.

## Consequences

- One more small, unauthenticated request when an invite link is opened.
- The first 19 joiners of each code are not attributed in Mixpanel.
- Mixpanel can split onboardings by shared code; the open-to-join rate per code
  is read from our own tables once a display is decided.
- A reload counts as another open, as a second showing of a card does
  (R-STAT-1).

## References

Amends R-ANA-3. Builds on ADR 0026 (analytics opt-in), ADR 0029 (per-IP
limits) and ADR 0033 (record activity, show it later). Requirements: R-ANA-3,
R-STAT-6, R-INV-1.
