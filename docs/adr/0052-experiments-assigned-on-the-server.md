# 0052. Run experiments in code, assigned on the server from the member's id

- **Status:** Accepted
- **Date:** 2026-10-13
- **Deciders:** Andy Moesch

## Context

ADR 0051 replaced the first card of each matches section with a sentence and a
_Read more_. It makes the screen an overview, and costs a tap before anyone can
connect. Which leads more members to connect is not known, and the founders
want to find out before they pick one (R-ASK-16). The app had no experiments.
Usage data reaches Mixpanel only from the server, and only for members who
opted in (ADR 0026). Hosts already change selected settings at runtime
(ADR 0031). Feature flags were discussed on 2026-10-05 and deferred until
needed; this is that need.

## Decision

- **Experiments listed in code** (`src/experiments.ts`), each a control and one
  treatment. A key not listed cannot be stored, assigned or reported.
  `matches_layout` is the first: _cards_, the screen before ADR 0051, and
  _summary_, ADR 0051's.
- **Assigned on the server from the member's id.** The bucket is
  `sha256(key + ':' + memberId)` modulo 100; the treatment goes to the buckets
  below the experiment's share. Nothing is stored, a member gets the same
  variant on every device, raising the share only moves members to the
  treatment, and one experiment's groups do not line up with another's.
  `GET /api/flags` answers the caller's variants; the client shows the control
  when it cannot read them.
- **A host moves the share** in the app, `flags.<experiment>` from 0% to 100%,
  stored as ADR 0031's other settings (R-EXP-3). 0% or 100% ends an experiment
  without a deploy. The default is an even split.
- **Measured in Mixpanel, not assigned there.** The client sends
  `experiment_exposed` (experiment, variant) when the member sees the variant,
  through `POST /api/events`, so the opt-in and the pseudonymous id apply as to
  every event. Outcomes are ordinary events; a funnel from `experiment_exposed`
  broken down by `variant` is the comparison. For the matches layout, the
  outcomes are `matches_section_opened`, `match_connect_tapped` and the
  existing `connection_requested`.

## Alternatives considered

- **Mixpanel's feature flags** — asking Mixpanel for a variant sends the id of
  every member, opted in or not, against R-ANA-4; and it puts a vendor in the
  request path.
- **GrowthBook or Unleash** — a service to run for one experiment.
- **A stored assignment per member** — a table and a backfill for what a hash
  gives.
- **A switch, one layout for everyone at a time** — compares two different
  weeks, not two groups in the same week.

## Consequences

- At summit scale (about 350 members, fewer of them opted in, fewer still with
  a challenge) only a large difference will show: a 10-point lift needs about
  360 members per variant. Read the result as a hint.
- Randomising per member suits screens and words, not the matcher: a member in
  one group is matched with members of the other.
- A host who lowers a share moves members back to the control mid-test, and
  their earlier events count for the treatment.
- Once a variant is picked, the other, its experiment and its setting are
  removed in one change, and the requirement says which stayed.
- Release flags (one switch for everyone) are not built; `game.enabled` stays
  the one switch until another is needed.

## References

Requirements: `R-EXP-1..3`, `R-ASK-15`, `R-ASK-16`, `R-ANA-1`, `R-ANA-3`,
`R-ANA-4`, `R-CFG-6`. Spec sections: `specs/design.md` §3, §7, S8. Amends
ADR 0051.
