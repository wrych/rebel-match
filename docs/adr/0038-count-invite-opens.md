# 0038. Count the opens of each invite, and show them with its uses

- **Status:** Accepted, amended by 0039
- **Date:** 2026-10-05
- **Deciders:** Andy Moesch

## Context

Invites are printed as QR codes on posters, slides and tables (R-INV-1). The
team wants to know which codes work: how often each is opened, and how many of
those who open it join. A host watching an event also needs to see when a code
is filling up.

The invite links screen already shows each invite's uses against its cap
(R-INV-9). Nothing records opens. Mixpanel cannot see a visitor who opens a
code: events go only for members who opted in (ADR 0026), and a visitor has not
even signed in.

Sending the invite a member joined through to Mixpanel was considered and set
aside: it could only be sent once an invite had admitted enough people not to
point at anyone, so every code's first joiners would be missing, and a partial
count reads as a wrong one.

## Decision

- **Opens are recorded in our own table**, as ADR 0033 records deck views:
  - Each time the entry screen loads with an `?invite=` token, the client tells
    the server once (`POST /auth/invite-opened`). The server records the
    invite and the time when the token names an invite, any state, and nothing
    else: no member, no address, no cookie.
  - It answers the same whatever the token, so it says nothing about which
    tokens exist, and it is counted under the per-IP sign-in limit (ADR 0029).
  - Opens go with the invite.
- **Each invite's card shows its opens beside its uses** on the invite links
  screen, for hosts with `invite:manage`: "140 opened · 96 of 400 used". A
  count of opens names nobody, so it is the one display of activity this ADR
  allows (R-STAT-2).
- **Nothing about invites goes to Mixpanel.**

## Alternatives considered

- **Record opens on the server when it serves the page** — needs no client
  call, but counts link previews and mail scanners, and the development server
  never sees it.
- **Send opens to Mixpanel** — needs consent the visitor has not given.
- **Send the invite id on `onboarding_completed`** — safe only past a minimum
  number of joiners, so each code's first joiners would be missing.

## Consequences

- One more small, unauthenticated request when an invite link is opened.
- A reload counts as another open, as a second showing of a card does
  (R-STAT-1), so opens are an upper bound on people.
- The open-to-join rate per code is on the host's screen, from tables we own.

## References

Builds on ADR 0026 (analytics opt-in), ADR 0029 (per-IP limits) and ADR 0033
(record activity, show it later). Requirements: R-STAT-2, R-STAT-6, R-INV-1,
R-INV-9.
