# 0013. Tell applicants their status, accepting email enumeration

- **Status:** Accepted, amended by 0043
- **Date:** 2026-10-02
- **Deciders:** Andy Moesch

## Context

Login previously returned the same "check your email" state whether or not the
address was on the whitelist, and `/auth/request-link` always answered 200. That
is the textbook defence against **email enumeration**: an attacker cannot use the
login form to discover who is a member.

It also lies to the one person who most needs the truth. Someone standing at the
summit who was never invited types their address, is told to check their email,
finds nothing, and refreshes — while the break runs out. There is no email, and
there will not be one until an admin approves them.

The event setting changes the weighting. The host wants to find the people who
cannot get in and approve them on the spot, and the whole product is built around
an onboarding budget of under two minutes (R-NFR-3).

## Decision

A whitelisted address and an unknown one lead to **different screens**. An
unknown address lands on a dedicated access-requested screen that explains what
happens next and promises an email containing a login link. The membership of the
whitelist is therefore discoverable through the login form, and we accept that.

Approval then sends the magic link itself, rather than a notice telling the
person to go back and request one.

## Alternatives considered

- **Keep the neutral state** — protects the list, and leaves applicants with no
  way to know that nothing is coming. Rejected: the failure mode lands on exactly
  the people we want to help.
- **Neutral state, plus an "I did not get an email" link** — keeps enumeration
  shut, but adds a step and still relies on the person guessing that they are not
  on the list.
- **Have the host collect names on paper** — no code, no leak, and nothing the
  app can act on. Fine as a fallback, not as the mechanism.

## Consequences

- The login form reveals whether an address is a member of a ~350-person invite
  list for a professional network. The names are not secret; the association with
  a specific challenge is, and that remains protected by ADR 0004.
- **Rate-limiting carries more weight now** — it is what stops enumeration from
  being cheap at scale. `/auth/request-link` is throttled per address and per IP.
- Applicants are told the truth, and the host gets a usable list of who is
  waiting: email, request time, and whatever name they chose to give (R-AUTH-11).
- Approval-issued links are not requested by the member, so they need their own
  longer TTL — 24 hours, not 15 minutes — and an expired one must fall back to
  the ordinary resend path rather than a dead end (R-AUTH-10).
- If this app ever opens beyond invited cohorts, revisit: the trade depends on the
  list being small, professional, and not sensitive in itself.

## References

Requirements: R-AUTH-2,3,4,9..12, R-NFR-3. Spec: `specs/flows.md` F4, F10.
