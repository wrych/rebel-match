# 0020. Slide the session on use, and renew its cookie from the seam

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** Andy Moesch

## Context

ADR 0018 gave a session a fixed `sessionTtlDays` from sign-in and listed it as
a known limit: a member who uses the app daily is still signed out after 30
days. R-AUTH-7 now asks for the opposite — the period counts from the last use
— so the expiry has to move, and so does the cookie's `Max-Age`, or the browser
drops a session the server still honours.

## Decision

This amends ADR 0018; everything else there stands.

- `sessionTtlDays` is an **idle** period. A request on a live session pushes
  its server-side expiry to `now + sessionTtlDays`.
- The seam gains one method:

```ts
/** A cookie to set when the session was extended, or null. */
renewSession(req: Request): Promise<SessionCookie | null>
```

The request middleware calls it once per request and sets the cookie it
returns, so the route still never names or builds a cookie (ADR 0015).

- An extension writes to the database **at most once a day** per session. A
  sliding 30-day window loses nothing by moving in day-sized steps, and a
  session is not rewritten on every request.
- `currentMember` stays a read.

## Alternatives considered

- **Slide inside `currentMember`** — hides a write inside a read, and still
  needs a way to hand the refreshed cookie back.
- **A cookie that outlives any session** (e.g. a year), the server enforcing
  idleness — no cookie refresh needed, but the browser keeps a dead credential
  around and its lifetime stops saying anything.

## Consequences

- Active members stay signed in indefinitely; an unused session — a lost or
  shared phone — ends 30 days after its last use.
- One more method on the seam, and one more call in the request middleware.
- The idle period is accurate to a day, not to the second.

## References

Requirements: R-AUTH-7, R-CFG-1. Amends ADR 0018. Spec: `specs/design.md` §8.
