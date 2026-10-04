# 0030. Ask for the human check before more link emails to one address

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** Andy Moesch

## Context

ADR 0029 stops link emails to an address after 3 in 15 minutes. That is
abrupt for a member who mistyped, lost the first emails to a spam folder, or
tries on a second phone: the fourth request looks as if it worked and sends
nothing. The human check from ADR 0029 already exists, costs a person about a
second, and makes each further request cost a script real work.

## Decision

- Per address, per 15 minutes: the first **3** link emails are sent as before.
- From the 4th to the **10th**, a request needs the human check first, as a new
  applicant past the per-IP cap does; once solved, the link is sent.
- Past 10, the answer is the usual screen and nothing is sent, as ADR 0029 had
  it past 3.
- Both numbers are configuration (R-CFG-1).

## Alternatives considered

- **Keep the hard stop at 3** — the member who needs a fourth link gets
  silence, and nothing tells them why.
- **Answer 429 past 10** — honest, but tells a script exactly where the limit
  sits; the silent answer keeps the address's state unstated.

## Consequences

- A member who asks for many links in a row sees a short check from the
  fourth on; nobody else ever does.
- The check shows only for addresses that get links, so it says the address is
  a member; the login screen already says so by design (ADR 0013).
- At most 10 emails per address per window instead of 3: more inbox noise for a
  targeted member, each beyond the third paid for in proof of work.

## References

Amends ADR 0029 (the per-address limit). Requirements: R-NFR-8, R-AUTH-4.
Spec: `specs/design.md` §8.
