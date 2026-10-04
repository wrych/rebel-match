# 0029. Rate-limit sign-in, with a self-hosted human check for new applicants

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** Andy Moesch

## Context

Nothing limits the sign-in endpoints yet. Each link request sends a real email
from our domain, and each unknown address records an applicant and emails
every host. Unlimited, a script can flood a member's inbox, bury the approvals
list, and burn the sending reputation the sign-in links depend on (R-NFR-3).

The obvious key, the client's IP address, is the wrong one at the summit:
everyone on the venue Wi-Fi shares one. A per-address limit does not stop
invented addresses, each of which is a first request. Hosted bot checks
(Cloudflare Turnstile, hCaptcha) send every visitor to a US third party;
Friendly Captcha keeps data in the EU only on a costly plan.

## Decision

- **Per address:** at most 3 link emails per address per 15 minutes. Further
  requests show the same screen and send nothing, so the limit reveals nothing.
- **Per IP, a backstop:** at most 1000 requests per 15 minutes across the
  sign-in endpoints. A whole room signing in twice stays far below it; past it
  the visitor is asked to try again in a few minutes.
- **New applicants per IP:** after 30 in an hour, recording another applicant
  needs a **human check**; past 300 in an hour, none is recorded until the hour
  has passed. Members, invite-link visitors and repeat requests never count.
- **The human check is ALTCHA, self-hosted:** our server issues a signed
  proof-of-work challenge, the browser solves it in about a second without
  the visitor doing anything, and the server verifies it once. No third party,
  cookie or device identifier is involved, so it needs no consent or new
  privacy wording. Its signing key is derived from `SESSION_SECRET`.
- **The client IP** is read from the forwarded header only behind a proxy the
  configuration trusts (`TRUST_PROXY`, the number of proxy hops; Cloud Run is
  one), never from a header any visitor can set.
- Counters live in each server's memory: a restart resets them, and a few
  Cloud Run instances each count on their own. Enough for the beta; Postgres
  can hold them later if it is not.
- Every number is configuration (R-CFG-1).

## Alternatives considered

- **A tight per-IP limit only** — locks out a room sharing the venue Wi-Fi.
- **Cloudflare Turnstile or hCaptcha** — free, but a US third party sees every
  visitor: privacy wording and a data transfer to justify.
- **Friendly Captcha** — EU, but EU-only hosting needs its top plan.
- **Image puzzles** — poor accessibility, and slow on a phone.
- **Counters in Postgres now** — exact across instances, but a write per
  request for a beta where approximate counts do the job.

## Consequences

- Proof of work proves cost, not humanity: a determined script still pays it,
  which is why the hard ceiling stays.
- A restart forgets the counters, so a script can briefly get a fresh budget;
  the per-address limit and the ceiling bound the damage.
- Two npm dependencies (the ALTCHA widget and its server library) join the app.
- Deployment must set `TRUST_PROXY=1` on Cloud Run, or every visitor shares
  the proxy's address and the per-IP limits apply to the whole internet at once.

## References

Requirements: R-NFR-8, R-NFR-1, R-NFR-3, R-AUTH-2, R-INV-11. Spec:
`specs/design.md` §1, §3, §8. Sources: <https://altcha.org/>
