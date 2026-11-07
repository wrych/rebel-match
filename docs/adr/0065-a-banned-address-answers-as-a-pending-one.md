# 0065. A banned address is answered as a pending one

- **Status:** Accepted
- **Date:** 2026-11-07
- **Deciders:** Andy Moesch

## Context

ADR 0055 had the login screen tell a banned address plainly that its account
was suspended. `POST /auth/request-link` needs no sign-in, so anyone who types
someone else's address learns that that person was banned by moderation. That
is personal data, disclosed without a legal basis, and it can harm the person's
reputation (GDPR Art. 5(1)(f), Art. 25). The per-IP limit is wide enough for a
crowded room, and this answer came back before any human check, so it did
little to stop such probing.

ADR 0013 accepts that the screen tells a member from an applicant, so that a
new applicant is told the truth and gets the request-access form. That trade
stays.

## Decision

A banned address is answered exactly as a pending applicant who asks again:
`{state: 'access-requested'}`, with no handle, no link and no notice to anyone.
The login screen's suspended view is removed.

A rejected address keeps its own answer (R-AUTH-13), and an unknown address
still becomes an applicant and gets the request-access form (R-AUTH-2).

## Alternatives considered

- **One answer for every address.** This would hide membership too, but would
  lose the request-access form for new applicants, which ADR 0013 chose to
  keep.
- **Tell the banned person by email instead.** This could follow later. For
  now, someone who is banned learns it from the host who banned them.

## Consequences

- A stranger can no longer tell a banned member from a pending applicant.
- A banned person is told that their request is waiting, which is not true.
  They hear the reason from a host, not from the screen. The controller's
  address stays in the privacy notice for questions.
- Membership and rejection can still be told apart at the door, as ADR 0013
  and R-AUTH-13 accept.

## References

Requirements: `R-MOD-10`, `R-AUTH-13`, `R-NFR-1`. ADRs 0013, 0055.
