# 0049. Run the scheduled work on a tick from Cloud Scheduler

- **Status:** Accepted
- **Date:** 2026-10-09
- **Deciders:** Andy Moesch

## Context

The server runs six timers (`src/server.ts`): the notification worker and the
settings refresh every minute, and every hour the erasure sweep, the token
purge and the two retention purges. A timer needs CPU between requests.

Cloud Run gives an instance CPU between requests only when it is billed for
being up, not per request. ADR 0025 buys that for production: one warm
instance with CPU always allocated, the largest line of production's bill,
larger than its database and the load balancer together, for timers that idle
nearly all the time. Staging is billed per request and scales to zero, so its
timers stall today between visits: a notification, or the 08:00 daily mail
(R-NOTE-7), waits for the next visitor.

## Decision

- **A tick drives the scheduled work.** `POST /api/internal/tick` runs the
  notification worker on every call, and each hourly job once its interval
  has passed since it last started on that instance. One Cloud Scheduler job
  per deployment calls it every minute. A tick answers 204 when all of the
  due work succeeded and 500 when any failed, so the scheduler records it.
- **Configuration chooses the mode**, `SCHEDULED_WORK=timers` (the default) or
  `tick`; the code does not branch on the environment (constitution §7). In
  `tick` mode no interval timer starts and the route exists; in `timers` mode
  it does not.
- **Staging and production run on the tick**, once their GitHub environment
  names the scheduler's account in `TICK_INVOKER`; the deploy then sets the
  mode. Previews keep the timers. Production is then billed per request too,
  keeping its one minimum instance, so no attendee waits on a cold start.
- **The scheduler proves who it is.** It sends a Google-signed OIDC token for
  its own service account, `scheduler-tick`, with the service's `run.app`
  address as the audience (`TICK_AUDIENCE`, set by the deploy). The server
  checks the signature against Google's published keys with `jose`, the
  issuer, the audience and that verified address, and answers anything else
  with not found (constitution §5).
- **The settings refresh moves onto the request path in `tick` mode**: an
  instance re-reads the hosts' changes before a request when its copy is older
  than `SETTINGS_REFRESH_SECONDS`, since a tick reaches only one instance
  (ADR 0031).
- The scheduler calls the `run.app` address, not the custom domain, so the
  tick does not depend on the load balancer or DNS.

## Alternatives considered

- **Keep CPU always allocated** — nothing to build, but it is most of
  production's monthly cost for six idle timers, and staging stays stalled.
- **Scale production to zero** — cheaper still, but the first scanner of a
  quiet break waits for a cold start (ADR 0025 rejected it for that).
- **One Cloud Scheduler job per timer** — six jobs where one fits; Cloud
  Scheduler is free for three per billing account.
- **A shared secret in a header** instead of OIDC — no token to verify, but the
  secret sits readable in the scheduler job's configuration.
- **`google-auth-library`** to verify the token — Google's own, but a large
  dependency tree for one check; `jose` has no dependencies.

## Consequences

- Production's bill drops by roughly the cost of the always-on CPU; the
  database and the load balancer remain its main lines. Staging's scheduled
  work runs on time, and exercises production's path every day.
- Scheduled work runs within a minute of its time while the scheduler runs. If
  the job is paused or failing, notifications and purges stop without a
  visible error; the uptime check task (R-NFR-10) must alert on failed ticks.
  A stopped non-prod database fails every tick: pause the job with it.
- Setting `TICK_INVOKER` hands the work over at the next deploy, and nothing
  scheduled runs until the scheduler job exists; the runbook creates it
  straight after (`docs/cloud-setup.md` §13, §22).
- A tick has a request's time limit. One round sends at most
  `NOTIFICATION_BATCH` mails, within the job's attempt deadline; the next
  minute picks up the rest. A tick that arrives while one runs shares it.
- With two instances, each runs its hourly jobs on its own hour. They are
  idempotent, and notifications are already claimed per server (R-NOTE-10), so
  a double run costs a query, not a double mail.
- Verifying a token fetches Google's keys, cached by `jose`; if Google's key
  endpoint is unreachable, ticks are refused until it answers again.

## References

Requirements: R-NOTE-7, R-NOTE-10, R-NOTE-11, R-MSG-6, R-NFR-10. ADRs 0025,
0031, 0032, 0034. `docs/cloud-setup.md` §13, §20, §22.
