# 0034. Hardened headers, transport and sessions

- **Status:** Proposed
- **Date:** 2026-10-05
- **Deciders:** Andy Moesch

## Context

The security pass before the pilot (tasks.md, M6) found the sign-in design
sound: tokens hashed and single-use, sessions HMAC-signed and stored hashed,
`next` validated, credentials redacted from the outbound log. What it found
missing sits around that design:

- The server sends no security headers. Nothing stops another site framing
  the app, and no Content-Security-Policy limits what a page may load.
- Production trusts its environment to be right. The session cookie is
  `Secure` only when `PUBLIC_URL` is https, and the per-IP limits see the
  proxy's address unless `TRUST_PROXY` is set. Neither is checked at start-up,
  so a mistyped production variable silently weakens both: on Cloud Run every
  visitor would share one per-IP budget.
- Signing in adds a session but never ends the one the browser already held.
- Expired sessions and used or expired magic-link tokens stay in the database
  for good.
- `GET /auth/verify?token=…` still forwards links issued before ADR 0027. Every
  such link has long expired, and the token in its query string lands in
  request logs.

## Decision

- **Security headers on every response, through `helmet`:**
  - a Content-Security-Policy of `default-src 'self'`, with no inline script,
    `object-src 'none'`, `base-uri 'none'`, `form-action 'self'` and
    `frame-ancestors 'none'`;
  - only what the human-check widget proves to need beyond that, checked in a
    browser and named in the code;
  - `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and
    HSTS for a year when `PUBLIC_URL` is https.
- **Production refuses to start with a weak environment:** `PUBLIC_URL` must
  be https and `TRUST_PROXY` at least 1. Development deployments, previews and
  staging among them, are unchanged.
- **Signing in rotates the session:** a valid sign-in ends the session the
  request presented before it creates the new one.
- **A purge removes expired sessions and used or expired tokens**, every
  `tokenPurgeIntervalHours` (1).
- **`GET /auth/verify` goes.** Only `POST /auth/verify` with the token from the
  sign-in screen's fragment remains.

## Alternatives considered

- **Headers set by hand** — a handful of `setHeader` calls, but `helmet` keeps
  the defaults current and is small, widely used and dependency-free.
- **Enforce the environment in the deploy script** — production's script is not
  written yet, and a check in `config.ts` covers every way the server starts.
- **Keep the legacy redirect** — it serves no link that still works.

## Consequences

- A new dependency, `helmet`.
- The CSP will break anything that loads from elsewhere. Today nothing does;
  a future third-party script or font needs the policy widened deliberately.
- A production start with an http `PUBLIC_URL` or `TRUST_PROXY=0` fails with a
  message naming the variable, as a missing `DATABASE_URL` already does.
- Old sessions and tokens no longer pile up; a member's other devices stay
  signed in, since only the session the sign-in request carried ends.

## References

Requirements: R-NFR-5, R-NFR-8, R-AUTH-5, R-AUTH-7, R-NAV-4, R-NAV-6.
Amends ADR 0027, which kept `GET /auth/verify` as a redirect for older links.
Builds on ADR 0018 (sessions) and ADR 0029 (per-IP limits).
