# 0058. Play the summit presentation in the app, scripted, cast from a private file

- **Status:** Accepted
- **Date:** 2026-10-25
- **Deciders:** Andy Moesch

## Context

For the summit on 2026-11-08 the maintainer wants a short, inspirational film
of the network for the main stage: an invented beginning with the two
founders, the real network growing, visits to people who shaped the
movement, the figures since launch, a zoom past today and a thank-you to the
room. Its words, timing and camera are known in advance and change only by
decision; nobody needs to edit it in the app.

It could be a video made outside the app or a screen in it. It names real
people in front of an audience, which the replay deliberately never does
(ADR 0057), and real addresses may not enter the repository (R-SEED-5).

## Decision

- **A screen in the app**, `/admin/presentation`, behind `network:present`,
  which only `admin` holds. It reuses the replay's timeline, layout, moons and
  camera, so the network on stage is the one in the database the day it is
  shown, and its figures are live.
- **One script, committed**: length and timed cues for words, camera, the
  replay's progress and highlights. People appear in it only as handles.
- **A pure director**: the picture is a function of the second reached. Play,
  pause, scrub and frame-by-frame recording all show the same frame, which
  makes rehearsal and a recorded backup video cheap.
- **A private cast file**, `PRESENTATION_CAST_FILE`, read by the server: each
  handle's display name, optional photo, optional member email and groups.
  The server sends handles, names, photos, groups and network positions,
  never emails. Hosts list only people who agreed. A development deployment
  without a file uses a fictional cast over the dev seed.
- **Invented parts are marked as such** in the script: the founders'
  beginning, the growth past today, the closing world's lone dot.
- **A dark palette** of its own, for a dark hall; the app's colours stay as
  they are.

## Alternatives considered

- **A video made outside the app** — no live data, and the network's whole
  engine rebuilt for one use. Kept as a fallback instead: the deterministic
  director lets the app record itself.
- **An editor for cues** — weeks of work for a one-off; the script is a file.
- **The cast in the repository** — names and photos are personal data, and
  emails may not be committed (R-SEED-5).
- **Cast in the database through an upload screen** — a table, an endpoint
  and a screen for a file read once; the deployment's secret mount does it.

## Consequences

- A named cast member's dot shows their real connections and moons to the
  room. That is why the cast is opt-in, kept out of the repository, and the
  host's responsibility.
- Until the real cast, photos, founders' challenges and music arrive, the
  film runs on fictional ones; swapping them is a file and a script change.
- The presentation is as heavy as the replay plus its invented copies: the
  growth past today multiplies the network on screen, bounded in the script.

## References

Requirements: `R-PRES-1`..`R-PRES-7`. Spec sections: `specs/design.md` §1
(The network presentation), §3, §4 (S42), `specs/flows.md` F23. ADRs 0006, 0057.
