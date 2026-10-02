# 0015. Build authentication in-app, behind a narrow seam

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** Andy Moesch

## Context

ADR 0003 chose passwordless magic links over a whitelist, but it never weighed the
alternative of handing identity to an external provider — Keycloak or a managed
passwordless service. The question came up before any code existed, which is the
right time to answer it.

What the situation actually is:

- **There are no passwords** (R-AUTH-8). The strongest reason to outsource
  authentication — credential storage, hashing, reset flows, breach exposure, MFA
  — does not apply, because ADR 0003 removed the problem rather than delegating it.
- **Keycloak has no first-class magic-link login.** It needs a community extension
  or a custom SPI, so the one flow we depend on would be the one piece we still
  had to write, in Java, in someone else's extension model.
- **Most of our auth surface is admission policy, not identity.** The whitelist
  (R-AUTH-1), the applicant queue (R-AUTH-2,3), approval-issued links
  (R-AUTH-10), the host's check-in list (R-AUTH-11,12), and QR invite tokens with
  windows, caps and revocation (R-INV-1..12) are all ours either way. An identity
  provider does not own who we let in.
- **The member row is the source of truth for things auth cannot hold**: consent
  version and timestamp (R-NFR-6), `analytics_id`, `joined_via_invite_id`, and the
  foreign-key target for challenges and connection requests.
- **One deployable** was a deliberate choice (ADR 0002), and we are five weeks from
  feature-complete with a hard summit date.

## Decision

Authentication is built in this application, and **confined to one module with a
narrow interface** so that replacing it later is a module swap rather than a
rewrite.

### The seam

A single `auth` module is the only thing that knows how a member proves who they
are:

```ts
type LinkKind = 'self_service' | 'approval'

interface AuthProvider {
  /** Issue a way in for this address and deliver it. Owns the TTL per kind. */
  issueLink(email: string, opts: { kind: LinkKind; next?: string }): Promise<void>

  /** Consume a presented credential. Returns the member it belongs to, or why not. */
  verifyToken(raw: string): Promise<VerifyResult>

  /** Start a session for an already-identified member. */
  createSession(memberId: string): Promise<SessionCookie>

  /** Who is calling, with roles and permissions resolved. Null when nobody. */
  currentMember(req: Request): Promise<MemberRef | null>

  /** End the session. */
  endSession(req: Request): Promise<void>
}
```

### What crosses the seam, and what must not

| Inside `auth` only | Stays in the application |
|---|---|
| `magic_tokens`, token generation and hashing | the whitelist, applicants, approval |
| TTLs per link kind (R-AUTH-5, R-AUTH-10) | invite tokens and their windows/caps (R-INV-*) |
| Cookie format, signing, session storage | consent version and timestamp (R-ONB-3) |
| Whether a presented credential is valid | what a valid member is *allowed* to do (R-ROLE-3) |

Rules that make the seam real:

- **Nothing outside `auth` reads or writes `magic_tokens`**, constructs a cookie,
  or knows a TTL. A route that touches a token hash is a defect.
- Routes and services receive an `AuthProvider`, never import a concrete one
  (constitution §4). A fake implementation is what makes R-QA-1's token tests run
  without a database.
- **Admission policy stays outside the seam on purpose.** It is tempting to push
  the whitelist and invites behind it "for symmetry" — don't. No provider
  implements our policy, so policy behind the seam is policy that has to come back
  out on the day we swap.
- `currentMember` returns a `MemberRef` with roles and permissions already
  resolved. Handlers never see a raw token or provider claims, so no handler can
  come to depend on their shape.
- **The member record remains ours.** A future provider holds credentials only,
  keyed to `members.id` by an `external_id` column added at that point.

## Alternatives considered

- **Self-hosted Keycloak** — mature token handling, brute-force protection and
  auth audit events for free, and a standards seam for future SSO. Against it: a
  JVM service with its own schema, upgrades and backups beside a Node app; no
  built-in magic link; and it splits the user store, which turns GDPR erasure
  (R-NFR-7) into a two-phase delete that can half-fail. We would keep a `members`
  table regardless, so the result is two user stores, not one.
- **A managed passwordless provider** (Stytch, Clerk, WorkOS Magic Auth, Auth0
  passwordless) — a much better fit than Keycloak, since magic links are the
  primary flow rather than an extension. Against it: another processor holding
  member email addresses, needing an EU region and a line in the consent copy, at
  a moment when we are already rewriting that copy (R-ONB-5, ADR 0005).
- **Build it with no seam**, auth logic spread through routes — the cheapest thing
  to write and the reason this decision would be irreversible. Rejected.

## Consequences

- **We own the risky parts**: rate limiting and brute-force protection on
  `/auth/request-link`, token single-use and expiry, cookie flags. All specified
  in design §8, all ours to get right, and all named as unit-test targets
  (R-QA-1).
- **We get no auth audit log for free.** Role grants are audited (R-ROLE-7) and
  invites record their creator (R-INV-8), but login events are only what we choose
  to record.
- The code is genuinely small — issue, hash, store, verify, consume, plus a signed
  cookie and a rate limiter — and it stays small because the seam gives it nowhere
  to spread.
- **The 2-minute budget keeps fewer moving parts.** No OIDC redirect hops on
  conference wifi inside R-NFR-3.
- Consent, profile, roles and challenges stay in one database, so erasure is one
  transaction.
- **Swapping later touches**: the `auth` module, an `external_id` column, and the
  login screen's redirect. It does **not** touch the whitelist, the applicant
  queue, invites, consent, or the permission model — which is the whole point of
  paying for the seam now.

## Revisit when

- **W4 returns** — integration with the Corporate Rebels member platform. That is
  SSO, and a provider is the right seam for it. Today it is a declared non-goal.
- Passwords, MFA, or social login become requirements.
- A second application needs the same identities.
- Keycloak (or equivalent) is already being run for something else, which makes
  the operational cost sunk and flips the arithmetic.

## References

Requirements: R-AUTH-1..12, R-INV-1..12, R-ROLE-3, R-QA-1, R-NFR-5,6,7.
Builds on ADR 0002 (one deployable), ADR 0003 (magic links), ADR 0006 (roles).
Spec: `specs/design.md` §1, §8. Constitution §4.
