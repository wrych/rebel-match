# 0009. Per-environment seed profiles

- **Status:** Accepted
- **Date:** 2026-10-01
- **Deciders:** Andy Moesch

## Context

Two kinds of seed data exist and they were being treated as one choice. The
prototype carries a fictional roster — Marieke, Tobias, Ana and a dozen others —
which makes a developer's first run useful: a non-empty swipe deck, populated
match lists. Production needs the opposite: the real invited-attendee whitelist
and the ~15 real challenges already collected for the summit, and absolutely no
fictional people.

The original spec asked which set to ship. That was the wrong question.

## Decision

Seeding is split into profiles chosen by `SEED_PROFILE`. Role records, the 8
trends, and the case studies seed everywhere. Prototype fixtures seed `dev`
only. The real whitelist and collected challenges seed `prod` only, loaded from
private files referenced by environment variables — never committed.

The seed runner refuses to load dev fixtures when the environment is production.
Fixture addresses use a non-routable domain. Seeds are idempotent, upserting by
natural key. Production members are seeded **un-onboarded**, so each person's
own consent timestamp is recorded by their own acceptance.

## Alternatives considered

- **One seed set for both** — either production shows fictional members, or
  developers start with an empty app. Both were on the table; both are bad.
- **Real challenges in the repository** — convenient, and a privacy problem:
  real attendee addresses in git history forever.
- **No production seed** — the first attendee to scan the QR code would find an
  empty deck, which is the worst possible first impression.

## Consequences

- A guard that must actually work, and is worth a test: dev fixtures in
  production is the failure mode that embarrasses us publicly.
- Deployment needs two private files supplied out of band.
- Consent is never pre-filled on anyone's behalf, which keeps the audit trail
  honest (R-NFR-6).
- Attribution of the collected challenges is still open: seeding them
  *attributed* would expose real people to connection requests before they have
  accepted the consent, so unattributed is the safer default until the authors
  agree (open question 5).

## References

Requirements: R-SEED-1..7, R-NFR-5, R-NFR-6. Spec: `specs/design.md` §6.
