# 0053. Give members private badges, counted from what they already do

- **Status:** Accepted
- **Date:** 2026-10-20
- **Deciders:** Andy Moesch

## Context

Gamification was a non-goal for the beta: the meeting wanted the app to be
about sharing challenges and experience (requirements §1). ADR 0045 let it in
for one easter egg, the office game, and kept the rest of the app as it was.
With the core journeys built, the maintainer wants recognition outside the
game: badges for posting challenges, offering help, being in the same boat,
connecting and climbing the game, and one per event a member came through.

Three things constrain it. Members hold sensitive problems here, so a badge
must not become a way to see what someone else did. The game promises that
nobody, hosts included, can link a pseudonym to a member (R-GAME-15). And an
event badge needs the host's logo, an SVG file, which can carry script.

## Decision

- **Badges are private.** A member sees their own and nobody else's, hosts
  included; the member's page in the host tools leaves them out. There is no
  standings list outside the game.
- **Counted from existing records.** Five rows, each counting one thing the
  app already stores: challenges posted, "been there" offers from the deck,
  "same boat" requests, people connected with, and the game's jobs reached.
  A level is earned at a configured count (1, 5, 10) and kept for good, even
  when the count falls.
- **A crown per row moves.** It belongs to whoever leads now; a tie keeps the
  holder. Gaining one is announced, losing one is silent, and the crown never
  names its holder to anyone else.
- **Awarded where the count moves**, in the same transaction as the act, with
  a notification of a new type, `badge`. Crowns are also checked on the tick
  (ADR 0049), because counts fall when nobody acts.
- **Promotions are a teaser.** The game row shows always while the game is
  on, naming its jobs but not where they come from. Reading a member's own
  game progress to show them their own promotions does not link a pseudonym
  to anyone else, so R-GAME-15 holds; the crown is computed over every
  player's progress and shown only to its holder.
- **Event badges come from invite links.** A host gives an invite a badge
  when creating it. Joining through it earns the badge, and so does a member
  already signed in opening it while it is valid, without using a place.
- **A logo is a picture and nothing else.** The upload is cleaned on the
  server with DOMPurify over jsdom, keeping SVG drawing only; it is served
  from our origin with a sandboxing content policy, and shown only through
  `<img>`. Each layer alone stops a script.
- **Launch is quiet.** What members earned before badges existed is recorded
  without notifications and without marking anything new.

## Alternatives considered

- **Public badges on member cards** — more social, and it would show how much
  someone posts or connects to everyone. Kept private for now; the data model
  allows showing them later.
- **Computing badges on read, storing nothing** — simpler, but a level could
  not stay earned when a count falls, and "new" needs a record.
- **Crowns shared on a tie** — fairer at first sight, but a crown held by
  five people says little; the holder keeping it rewards getting there first.
- **A raster logo (PNG)** — no script risk, but blurry on a ticket drawn at
  any size, and hosts have their event logos as SVG.
- **Our own SVG allowlist parser** — no new dependency, but a sanitizer is
  exactly the code not to write ourselves days before a summit.

## Consequences

- The non-goal in requirements §1 narrows: standings outside the game and
  milestone pop-ups stay out. R-MEM-2 gains a second exception.
- R-GAME-15's "no query outside the game reads `game_players`" gains one, the
  badges' own, which returns only the member's own badges.
- Every service that records a counted act calls the badge service; a new
  counted act later means touching that service, not the badges.
- DOMPurify and jsdom join the server's dependencies, for one upload path.
- Counts are honest only as far as the acts are: a member can post ten short
  challenges for a Firebrand. The length limits and the privacy of badges
  make that not worth guarding further.

## References

Requirements: `R-BADGE-1..14`, `R-INV-13`, `R-NOTE-1`, `R-NOTE-2`, `R-MEM-2`,
`R-PROF-3`, `R-NFR-7`. Spec: `specs/design.md` §1 "Badges", §2, §3, §4,
§8; `specs/flows.md` F19. Amends ADR 0045.
