# 0003. Passwordless magic-link auth over a whitelist

- **Status:** Accepted
- **Date:** 2026-10-01
- **Deciders:** Andy Moesch, Ivo Pejakovic, Pascal Dulex

## Context

Members meet the app for the first time by scanning a QR code during a
conference break, on a phone, with minutes to spare (R-NFR-3). A password —
choosing one, storing it, resetting it — is the slowest and riskiest part of
that minute. The app is also closed: only invited attendees may enter.

From the meeting: _"something like a magic link that is then sent to your email…
really simple user management."_

## Decision

Login is a single-use magic link emailed to an address on an approved whitelist.
No passwords exist anywhere in the system. Unknown addresses become pending
applicants for an admin to approve.

## Alternatives considered

- **Email + password** — slower onboarding, a password store to protect, reset
  flows to build. Nothing gained for a 350-person closed beta.
- **OAuth (Google, LinkedIn)** — fast, but drags in consent scopes and a
  provider dependency, and attendees' work addresses are not reliably Google
  accounts.
- **Shared summit code** — no identity, so no double opt-in and no match
  history.

## Consequences

- The onboarding budget now depends on **email delivery**: the link must reach a
  phone inbox in ~30 s or R-NFR-3 fails. Deliverability became a tracked risk
  (open question 4) and a hardening task.
- Tokens are a credential: hashed at rest, single-use, short-lived, rate-limited
  (R-NFR-5).
- Losing inbox access means losing account access. Acceptable for a beta.
- Testing login needs a mailbox — which is what pushed us to ADR 0008.

## References

Requirements: R-AUTH-1..8, R-NFR-3, R-NFR-5. Spec: `specs/flows.md` F1.
