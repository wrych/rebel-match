# 0037. Store every notification, and mail it at a cadence each member picks per type

- **Status:** Proposed
- **Date:** 2026-10-05
- **Deciders:** Andy Moesch

## Context

Each notification email goes out inside the request that causes it: a
connection request, an acceptance, a new applicant. Nothing holds a member's
notifications anywhere else, so a request whose email fails is withdrawn,
or its target would never learn of it.

At the summit that sends many mails in a short time: a member with a common
challenge may get ten requests in an hour, and every admin gets one mail per
applicant. Following a trend promises notice of new challenges in it (R-ASK-9),
which nothing sends yet and which would send the most. Members differ in what
they want: a request may be worth a mail at once, a new challenge in a trend
once a day, and some want no word of trends at all.

## Decision

- **Every notification is stored** in a `notifications` table: one row per
  recipient and event, holding references (the request, the challenge, the
  member it is about), never rendered text. The app lists them; mail is one
  way of delivering them.
- **Each type has a cadence the member picks**, from five: _Immediately_,
  _Hourly_, _Daily_, _In the app only_, _Off_. Applicant notices offer a sixth,
  _Every 15 minutes_. Defaults: connection requests and new connections hourly,
  new challenges in a followed trend daily, applicant notices every 15 minutes.
- **Mail is grouped by cadence, not by type.** Every type a member has on the
  same cadence goes out in one mail. _Hourly_ and _Every 15 minutes_ send the
  first at once and the next no sooner than that window after the last mail
  of the same cadence; _Daily_ sends once a day at a configured time.
- **A worker delivers**, on a short interval in the server process, as the
  purge jobs run (ADR 0025). Before mailing it drops what the member has seen
  in the app or what no longer applies, and it retries a failed send.
- **Sign-in mail is not a notification.** Magic links and approval links still
  go out at once from the request (R-NFR-3).
- **The cadence windows are fixed in code**, since the options name them; the
  daily time and the worker's interval are configuration.

## Alternatives considered

- **Keep sending from the request** — simple, and the summit floods inboxes.
- **One cadence for all of a member's notifications** — fewer settings, but a
  member then trades prompt requests against quiet trends.
- **Free per-type intervals** — every number a member could want, and a
  settings screen nobody reads. Five named options cover the cases we know.
- **Group per type** — simpler clocks, but a member on hourly for two types
  gets two mails an hour instead of one.
- **A queue service (Cloud Tasks, Pub/Sub)** — scales past one process, which
  the beta does not need; the table is already in the database we back up.

## Consequences

- A request no longer depends on its email: it is stored with its
  notification, and the mail is retried. `notifyOrWithdraw` goes.
- Mail is late by design for anything not set to _Immediately_; in the room
  the app's badge tells the member first.
- The menu gains a badge and a notifications screen; the profile gains a
  setting per type.
- A digest quotes several members, so the outbound log records every member a
  mail quotes, and erasing any of them erases the entry (R-MSG-6).
- The worker needs CPU outside requests: production keeps one instance warm
  (ADR 0025); dev and staging deliver while an instance is up.
- Two servers may run the worker; a row is claimed before it is mailed, so it
  goes out once.

## References

Requirements: R-NOTE-1..11, R-CONN-2, R-CONN-7, R-CONN-9, R-AUTH-2, R-ASK-9, R-PROF-3,
R-MSG-6, R-NFR-7. Builds on ADR 0016 (outbound log) and ADR 0025 (warm
instance). Spec: `specs/requirements.md` §8h, `specs/design.md` §2, §3, §4.
