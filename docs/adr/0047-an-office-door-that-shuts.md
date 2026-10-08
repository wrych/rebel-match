# 0047. Give the boss's office a door that shuts now and then

- **Status:** Accepted
- **Date:** 2026-10-08
- **Deciders:** Andy Moesch

## Context

The third playtest of 9toRevolution (ADR 0045) asked for a door to the boss's
office that closes every now and then and has to be opened, and that is solid:
a player in its way stops it, so they have to step aside or stand smartly.
Until now the office had an open doorway, and nothing in the game ever stood
between the boss and the floor.

## Decision

- **A door with a body.** The office door is a leaf hinged at the top of the
  doorway that swings into the office. The player bumps into it wherever it
  stands, and it stops swinging rather than pass through the player.
- **It shuts now and then.** Some time after it was last opened (a host
  setting, around which each wait varies), the door swings shut by itself; a
  shut door is opened with the action button, from either side.
- **Only the boss uses it.** Employees never walk through the office, so the
  door touches nothing but the player.

## Alternatives considered

- **A door that pushes the player** — simpler to play, but the playtest asked
  for one that has to be stood clear of.
- **A door that locks for a while** — a pure wait, with nothing to do well.

## Consequences

- Settings grow one number: how long the door stays open, on average.
- The office's doorway is no longer free passage: leaving it to hand out a file
  can now cost a moment, more so standing in the door's swing.

## References

Requirements: R-GAME-21. Amends ADR 0045. Spec: `specs/requirements.md` §8i,
`specs/design.md` §1 (The 9toRevolution game).
