# 0045. Hide 9toRevolution, an office game, behind the impressum in happy mode

- **Status:** Accepted
- **Date:** 2026-10-07
- **Deciders:** Andy Moesch

## Context

The beta's core journeys are close to done ahead of the summit, and the team
wants a reward for the members who look around: an easter egg, in the spirit of
the browser's offline dinosaur game. Three earlier decisions stand in the way.
Happy mode may change colours only, never behaviour (R-LOOK-2, ADR 0023).
Gamification, standings and ranks were a _Won't_ for the beta (W1). And a
member's page in the host tools shows everything held about them (R-MEM-2),
while a leaderboard is only fun if nobody, hosts included, can see who sits
behind an anonymous score. The game must also never put the summit at risk: if
it is not ready, or misbehaves on the day, it has to disappear without a
deploy.

## Decision

- **9toRevolution**, a top-down office game, is the impressum's last card, shown
  only in happy mode to members who completed onboarding. Its **Be a rebel**
  button opens the game at `/9torevolution`, which also runs only in happy mode.
  This is the one exception to R-LOOK-2: happy mode reveals the card and lets
  the game run.
- **Gamification is allowed** within the game: jobs, levels, a leaderboard.
  W1 leaves the _Won't_ list; the app outside the game stays as it is.
- **A game's results are recorded, never shown with a real name** unless the
  member shares it. Each player gets a stable pseudonym ("Furious Rebel"). The
  link between pseudonym and member lives in the database only, as usage
  records do (ADR 0033): no screen, endpoint, export or permission shows it,
  hosts included, and the member's page in the host tools leaves the game out.
- **Hosts switch the game on and off**, and tune its numbers, on the settings
  screen, through the same `setting_overrides` as ADR 0031. Off, the card is
  gone and every game URL and endpoint answers not found.
- **Our own code, no game engine.** A pure, seeded simulation
  (`step(state, input, dt)`) is unit-tested without a browser; a thin Canvas 2D
  renderer draws smooth vector characters in code, with a pixel-art look as the
  fallback if time runs short. The game is a lazily loaded chunk, outside the
  client bundle budget of the login path.
- **Landscape only.** The game asks for the phone to be turned; every other
  screen stays portrait-first (R-NFR-2).

## Alternatives considered

- **A game engine (Phaser, PixiJS)** — faster to a first frame, but hundreds of
  kilobytes for a hidden extra, and a simulation tied to the engine is hard to
  test without a browser.
- **Hosts see real names behind scores** — useful against a fake score, but it
  breaks the promise that makes an anonymous board honest. Plausibility checks
  and a rate limit are enough for an easter egg.
- **A game visible in every mode** — no exception to R-LOOK-2, but no secret
  either; the egg is found by those who play with the colours.
- **A switch in the environment** — simpler, but turning the game off on the
  summit day would need a deploy.

## Consequences

- R-LOOK-2 and R-MEM-2 carry an exception each, and R-PROF-4's deck gains a
  card that depends on the mode.
- The settings screen grows a group for the game; its many numbers make the
  game tunable during the pilot without code.
- A score can be faked by anyone who reads the API. We accept that.
- Results are personal data: they go with the account (R-NFR-7), and the day
  log goes with the activity history (R-STAT-4).
- The game is the one screen that is landscape-only and drawn on a canvas, so
  its accessibility rests on shape cues and keyboard play rather than on the
  DOM; the menus around it stay ordinary screens and overlays.

## References

Requirements: R-GAME-1..20, R-LOOK-2, R-MEM-2, R-PROF-4, R-CFG-6. Amends ADR
0023 and ADR 0031. Spec: `specs/requirements.md` §8i, `specs/design.md` §1
(The 9toRevolution game), §2, §3, §4, §7, `specs/flows.md` F18.
