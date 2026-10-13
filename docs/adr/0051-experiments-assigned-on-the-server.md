# 0051. Run experiments in code, assigned on the server from the member's id

- **Status:** Accepted
- **Date:** 2026-10-13
- **Deciders:** Andy Moesch

## Context

The founders want to try a new layout for a challenge's matches, one sentence
per section with its cards a tap away, against the current one, and see which
leads more members to connect before they pick one. The app had no
experiments. Usage data reaches Mixpanel only from the server, and only for
members who opted in (ADR 0026). Hosts already change selected settings at
runtime (ADR 0031). Feature flags were discussed on 2026-10-05 and deferred
until needed; this is that need.

## Decision

- **Experiments listed in code** (`src/experiments.ts`), each a control and one
  treatment. A key not listed cannot be stored, assigned or reported.
  `matches_layout` is the first: _cards_, the matches screen as it is, and
  _summary_, the sentence per section that the next change specifies and
  builds. Until then both variants show the cards.
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
  broken down by `variant` is the comparison.

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

Requirements: `R-EXP-1..3`, `R-ANA-1`, `R-ANA-3`, `R-ANA-4`, `R-CFG-6`.
Spec sections: `specs/design.md` §3, §7. Amends ADR 0031.
