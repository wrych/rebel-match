# 0060. Open the recap at a set time, and announce it once

- **Status:** Accepted
- **Date:** 2026-10-25
- **Deciders:** Andy Moesch

## Context

The recap (ADR 0059) opened only when a host flipped its switch, and
nobody was told. The maintainer wants it to open by itself when the summit
ends, and every member told once, with a plain yes or no to the email
rather than the five cadences other notifications offer. They also want a
comparison shown only when it flatters: "Ahead of 30% of rebels" reads as
a put-down.

## Decision

- **An opening time among the settings.** `limits.recapOpensAt` holds whole
  minutes since 1970 in UTC, 0 for none, so it lives with the numeric
  settings, their overrides and their audit; the settings screen edits it as
  a date and time in the host's own time zone. The recap is open while the
  switch is on or once the time has passed. Closing it takes both off.
- **Announced once, by a scheduled job.** The first time the job finds the
  recap open, it writes a notification for every active, onboarded member
  and a row in `recap_announcement` in one transaction. Nothing announces
  it again, whatever the switch does after.
- **A notification type of its own, `recap`, with a yes-or-no choice.**
  Stored as a cadence, so the worker, the list and the outbound log treat it
  like any other: Yes is `immediately`, No is `in_app`, Yes by default.
- **Comparisons from half up.** A share below `limits.recapMinShare` (50)
  is left out, as a count nobody is below already was.

## Alternatives considered

- **A date setting of a new kind** — a string value would need its own
  parsing, storage and audit beside the numeric ones, for one setting.
- **Sending from the switch's change** — a time set ahead would then never
  announce, and a server asleep at the moment (dev and staging scale to
  zero) would miss it. A job that checks catches up on its next run.
- **The usual five cadences** — a digest that holds a one-off message for a
  day defeats it; the maintainer asked for yes or no.

## Consequences

- The announcement goes out within a minute of the time on a server that is
  up; on one scaled to zero, on its next tick.
- A member who joins after the announcement is not told; the menu offers
  the recap.
- A host who closes the recap after it was announced leaves members with a
  notification whose link answers as not found; a waiting email is not
  sent.

## References

Requirements: `R-RECAP-3`, `R-RECAP-8`, `R-RECAP-9`, `R-NOTE-1`,
`R-NOTE-2`. Spec sections: `specs/design.md` §1 (configuration), the
summit recap, notifications. ADRs: 0037, 0049, 0059.
