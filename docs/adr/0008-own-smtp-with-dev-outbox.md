# 0008. Own SMTP server, with a no-send outbox in development

- **Status:** Accepted
- **Date:** 2026-10-01
- **Deciders:** Andy Moesch

## Context

Magic-link login makes email a hard dependency (ADR 0003): no mail, no login.
The spec had "which transactional provider?" as an open question, until the team
confirmed it already runs an SMTP server.

That leaves development. A developer logging in as a seeded member should not
need a real mailbox, and a misconfigured dev environment must never mail a real
attendee — especially not during the week before a summit.

## Decision

Production sends through the team's own SMTP server via nodemailer, configured
from the environment. Development runs a second transport, `outbox`, that
**sends nothing**: every message is written to an `outbox` table and read back
on a dev-only admin screen where the magic link is clickable and copyable.

The transport is configuration, so the same build runs in both environments. The
outbox routes are registered only when that transport is active, so production
has no endpoint that lists magic links.

## Alternatives considered

- **A transactional provider (Postmark, SES, SendGrid)** — better deliverability
  reporting, but an account, a cost, and a processor to document, when a working
  SMTP server already exists.
- **Catch-all dev mailbox (Mailhog, Mailpit)** — good tooling, but another
  service to run, and the magic links then live outside the app.
- **Logging links to the console in dev** — works, but unreadable in a shared
  log and useless for checking the actual email body.

## Consequences

- No third-party processor for email, so nothing to add to the privacy notice.
- Deliverability is now ours to own: the from-address and SPF/DKIM/DMARC decide
  whether the link lands in 30 s or in spam (open question 4, R-NFR-3).
- The outbox doubles as the integration-test mailbox, so the auth flow is
  testable without network (R-QA-2).
- A dev-only route exists, which must stay off in production — enforced by
  registration, and a rule in the constitution §5.

## References

Requirements: R-DEV-1..4, R-NFR-3, R-NFR-5. Spec: `specs/flows.md` F14.
