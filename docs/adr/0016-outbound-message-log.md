# 0016. Record every outbound message, in every environment

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** Andy Moesch
- **Amends:** ADR 0008

## Context

ADR 0008 treated the outbox as a development affordance: a transport that captures
mail instead of sending it, so a developer can click a magic link without a
mailbox. The screen was to be registered only in development, so production had no
route that could list links.

That leaves production with **no record of what it sent**. Outbound email is the
one part of the system nobody can observe after the fact: you cannot look in
someone else's inbox. At a summit, with a ten-minute break running out, the first
question is always _"did it actually go out?"_ — and the dev-only design cannot
answer it.

The pattern is familiar from ERP systems, which keep a permanent communication log
precisely because outbound messaging is otherwise unauditable.

## Decision

The outbox becomes a **permanent domain table in every environment**: every
message is recorded with its recipient, type, subject, status, timestamps and any
transport error, and the admin screen that reads it is a real feature guarded by
the `outbox:read` permission (R-MSG-1, R-MSG-5).

Recording and delivering are separate concerns. Configuration decides only whether
mail **leaves the machine**: `mail.delivery=smtp` in production,
`mail.delivery=none` in development (R-DEV-1, R-DEV-4).

Two rules make the log trustworthy:

- **Record before sending**, then update the status. A crash mid-send leaves
  evidence of the attempt rather than a silent gap (R-MSG-2).
- **Statuses distinguish intent from failure**: `suppressed` (we chose not to
  send) can never be confused with `failed` (we tried and could not) — R-MSG-3.

And one rule keeps it from becoming a liability:

- **A log is not a key cupboard.** A magic link is a credential. Outside
  development, the token is redacted from the stored body before it is written, so
  an admin sees _that_ a link was sent, to whom and when — never the link itself
  (R-MSG-4). The body stays intact only where mail cannot reach anyone (R-DEV-1).

## Alternatives considered

- **Keep it dev-only (ADR 0008)** — no credential ever sits in a production table,
  and no way to answer the one operational question that will be asked out loud at
  the summit. The reason this ADR exists.
- **Log metadata only, never bodies** — avoids redaction entirely and is tempting.
  Rejected because the development affordance depends on a clickable link, and the
  redaction is a two-line transformation on a token the mailer already holds.
- **Store bodies verbatim, trust admins** — an admin could sign in as any member
  by reading the log, which would quietly make `outbox:read` the most powerful
  permission in the system and defeat ADR 0004's double opt-in on the way.
- **A separate permission for reading bodies** — finer-grained, and it still ends
  with a usable credential behind a permission. Redaction removes the problem
  rather than guarding it.

## Consequences

- **A deliverability problem becomes diagnosable in production.** The log
  separates "never sent" from "transport refused" from "sent and the inbox
  swallowed it" — and only the third sends you to the DMARC records. Direct
  support for R-NFR-3.
- **The log holds personal data**: email addresses and message content. So it is
  included in erasure (R-NFR-7, via `ON DELETE CASCADE` on `member_id`) and
  retained for a bounded, configurable period rather than forever (R-MSG-6).
- R-DEV-2 and R-DEV-3 are superseded. They stay in place, marked, because they are
  cited across the spec — the numbers are not reused and the gap is not closed.
- Production now **refuses to start with delivery switched off** (R-DEV-5). The
  old design made that state merely unusual; the new one makes it indistinguishable
  from working, since records would accumulate while nobody could log in.
- Bounce and complaint handling stays out of scope for the beta: asynchronous
  bounces arrive as mail to the return path, which is a feature of its own. The
  `status` enum has room for it.

## References

Amends ADR 0008 (own SMTP, dev outbox). Requirements: R-MSG-1..7, R-DEV-1,4,5,
R-NFR-3, R-NFR-7. Spec: `specs/design.md` §2, §3, §8; `specs/flows.md` F14.
