# 0018. The auth seam owns its sessions and hands routes the cookie

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** Andy Moesch

## Context

ADR 0015 puts cookie format, signing and session storage inside `auth/`, and
sketches `createSession(memberId): Promise<SessionCookie>` and
`endSession(req): Promise<void>`. Implementing it showed two gaps:

- `design.md` §1 named `express-session`. That library owns `req.session` and
  sets the cookie from middleware, so every handler would touch session state
  and the seam would not be where sessions live.
- Logging out has to **expire the cookie** in the browser, not only delete the
  server-side row. With `endSession` returning `void`, the route would need to
  know the cookie's name and flags, which ADR 0015 forbids.

## Decision

This amends ADR 0015; everything else there stands.

- The seam keeps its own sessions in the `sessions` table: a 32-byte random id,
  HMAC-signed under `SESSION_SECRET` in the cookie, stored only as its SHA-256 —
  the same treatment as `magic_tokens`. No session middleware.
- `createSession` and `endSession` both return a `SessionCookie` (name, value,
  flags). The route applies it verbatim with `response.cookie(...)`, so it
  never constructs or names a cookie:

```ts
createSession(memberId: string): Promise<SessionCookie>
endSession(req: Request): Promise<SessionCookie> // an expiring cookie
```

- A session lives `sessionTtlDays` (default 30) from sign-in, from config.

## Alternatives considered

- **`express-session` with a MySQL store** — well known, but it spreads
  `req.session` through the handlers and stores the raw session id, so a
  database read could replay sessions. Rejected.
- **`endSession` returning `void` and routes clearing a known cookie name** —
  leaks the cookie's name and flags out of the seam. Rejected.

## Consequences

- No session dependency; about sixty lines of code, unit-tested against the
  in-memory store and integration-tested against MySQL.
- Expired session rows are not yet purged. They are harmless — an expired row
  never resolves to a member — but they accumulate until a cleanup job exists.
- Expiry is fixed from sign-in, not sliding: a member signs in again after 30
  days even if active. Acceptable for a beta measured in weeks.

## References

Requirements: R-AUTH-7, R-NFR-5. Amends ADR 0015. Spec: `specs/design.md` §8.
