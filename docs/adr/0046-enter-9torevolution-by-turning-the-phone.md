# 0046. Enter 9toRevolution by turning the phone; play in landscape, choose in portrait

- **Status:** Accepted
- **Date:** 2026-10-08
- **Deciders:** Andy Moesch

## Context

The first playtest of 9toRevolution (ADR 0045) found two things. Turning the
phone was the game's rhythm: a card and a lobby in portrait, each day in
landscape, its results back in portrait, so the phone flipped with every
level. And the day had no shape: the moment everyone sat down, screens turned
to Corporate Rebels at the full rate, while the boss was still in the office,
and the afternoon felt slow by comparison.

## Decision

- **The door is a turn of the phone.** The impressum has no 9toRevolution card.
  In happy mode, for a member the game is open to, turning the phone to
  landscape on the impressum's community card opens the game. A screen without
  touch, which cannot turn, gets a small _Be a rebel_ button on that card.
- **Playing is landscape, choosing is portrait.** The days, their results and
  the next day follow each other in landscape without the phone turning. Held
  upright, the game pauses and shows the lobby (pseudonym, play from, sharing,
  leaderboard), which is a portrait screen; turned back, the same day carries
  on.
- **A day builds up.** No screen turns in the first seconds after 09:00, then
  temptation runs slower than its set average in the morning and faster in the
  afternoon, the same on average over the day. The quiet start and the ramp are
  host settings (ADR 0031).

## Alternatives considered

- **Results in portrait** — the menus stay together, but the phone still turns
  twice a day, which is what the playtest disliked.
- **Only a quiet start** — fixes the burst at 09:00, but leaves the afternoon
  flat.

## Consequences

- Amends ADR 0045's door: no card, no button on touch screens. The egg is
  harder to find; the community card shows a small turn-the-phone sign in happy
  mode while the game is open.
- A day lives on while the lobby is shown upright, so leaving it is a choice in
  the lobby, not a side effect of turning the phone.
- Settings grow three numbers: the quiet start, and the rate at 09:00 and at
  17:00 as a share of the average.

## References

Requirements: R-GAME-1, R-GAME-4, R-GAME-12, R-GAME-14, R-GAME-17, R-PROF-4.
Amends ADR 0045. Spec: `specs/requirements.md` §8i, `specs/flows.md` F18,
`specs/design.md` §1 (The 9toRevolution game).
