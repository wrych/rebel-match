# 0014. Invite tokens in the QR code, auto-approving the scanner

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** Andy Moesch

## Context

ADR 0013 gave applicants an honest screen and ADR 0003's approval step a link
instead of a notice. Both help, and neither fixes the real problem: a host cannot
approve people one at a time during a ten-minute break. Anyone not on the
whitelist still waits for a human, so R-NFR-3's two-minute budget simply does not
apply to them — and at a summit, the people most worth admitting are often the
ones nobody thought to invite.

The whitelist was the beta's entire access model (R-AUTH-1). Keeping it absolute
means keeping the queue.

## Decision

The QR code may carry an **invite token**: `/?invite=…`. A non-whitelisted address
arriving with a usable token is created active, granted the `member` role, and
emailed a magic link immediately — no applicant queue, no admin in the loop. The
two-minute path now covers them.

Because the token is **printed on a poster in a room full of people**, it is
treated as a public capability rather than a secret. Its controls are:

- a **validity window** (R-INV-2),
- a **use cap** (R-INV-4),
- **instant revocation**, effective on the next use (R-INV-3),
- an **audit trail**: which invite admitted whom, and which admin created it
  (R-INV-8),
- and a **graceful fallback**: an unusable token does not fail, it carries the
  person into the ordinary applicant flow with a notice that the invitation link
  is not valid, on the screen that explains they are waiting for approval. A
  printed QR code cannot be recalled, so this path is the normal one, not the
  exceptional one (R-INV-5).

Invites are managed on their own admin screen (R-INV-9).

## Alternatives considered

- **Keep approval-only** — safest, and it leaves the host approving people by
  hand during the break the app exists to fit inside. Rejected: it is the problem.
- **A shared code typed by hand** — same trust model, more friction, and it
  invites typos in the one place we are counting seconds.
- **Domain allowlist instead of a token** — tighter, but attendees arrive with
  personal addresses and the host cannot know the domains in advance. Still
  available later as an extra constraint on an invite.
- **Hash the token at rest**, as magic links are — buys nothing for a value on
  display, and it would prevent the admin screen from re-rendering the QR, which
  the host needs (R-INV-9).
- **No use cap** — simpler, and a photographed link could then admit an unbounded
  crowd. The cap is the cheapest protection against the worst outcome.

## Consequences

- **The whitelist is no longer the sole gate.** R-AUTH-1 now reads "whitelist *or*
  a valid invite", and R-ONB-5's consent copy had to change: the app is closed by
  *invitation*, not to "whitelisted members only". Saying "closed" while a QR on
  the wall admits anyone would have been false.
- **A leaked link is expected, not a breach.** Someone photographs the poster and
  posts it; the window, the cap and revocation are what bound the damage. Plan for
  it rather than treating it as a failure.
- Revocation must never be cached — a stale read of `revoked_at` keeps a closed
  door open.
- **Enumeration (ADR 0013) changes shape**: with a usable invite every address
  "works", so the login screen stops distinguishing members from non-members for
  that scan. The trade in 0013 still stands for scans without one.
- Someone admitted by invite is a full member, so they appear in the swipe deck
  and can request connections. The double opt-in (ADR 0004) is what keeps that
  safe, and it is unchanged.
- Consent is still theirs to give: auto-approval skips the admin, never onboarding
  (R-INV-6).
- Members carry `joined_via_invite_id`, so if an invite turns out to have admitted
  the wrong crowd, the batch is identifiable and deletable (R-NFR-7).

## References

Requirements: R-INV-1..12, R-AUTH-1,2, R-ONB-5, R-NFR-3, R-NFR-7.
Spec: `specs/flows.md` F15, F16; `specs/design.md` §2, §3, §4.
