# 0057. Replay the network's growth in 3D, naming nobody but the viewer

- **Status:** Accepted
- **Date:** 2026-10-25
- **Deciders:** Andy Moesch

## Context

The maintainer wants members to watch the Rebel Match network grow: members
appearing, connections forming, and at the end the viewer finding themselves
in it. Hosts will later want the same picture on a stage, in a presentation
mode that is not part of this change.

Three things constrain it. Who is connected with whom is private: contact
details need an accepted connection (ADR 0004), and badges, which count
connections, are seen by nobody else (ADR 0053). A 3D scene needs a library
the client does not have. And the summit concentrates most joins into a few
hours, so a replay on the calendar alone would show weeks of nothing and then
a flash.

## Decision

- **Anonymous points.** The server sends each active, onboarded member as a
  position in a list, and each accepted connection as a pair of positions.
  No member id, name or profile field leaves it. Only the viewer's own point
  is marked, and their own lines take the accent colour.
- **A pace, not timestamps.** Each join and connection carries a place in the
  replay from 0 to 1: 35% calendar time, 65% its rank among the events, so a
  dense stretch plays slower and growth stays continuous. The place is
  rounded to a thousandth and the only date sent is the day, so the replay
  tells no moment more exactly than it needs.
- **three.js, with our own layout.** `three` draws the scene; a small seeded
  force layout in our code places the settled network once, and the replay
  grows into that shape. Nothing else from the 3D ecosystem is added. The
  screen is a chunk of its own, loaded when opened, outside the bundle budget
  as the game is (ADR 0045).
- **A seam for presentation mode.** The graph component takes a timeline, a
  scene factory and whether to highlight the viewer, and exposes play, pause,
  seek and restart. A presentation screen can reuse it with a timeline that
  marks nobody and drive it without the member's controls.
- **Behind a switch hosts hold**, `limits.networkReplay`, off by default, and
  a permission, `network:view`, that the member role carries. Off, the
  address answers as not found.

## Alternatives considered

- **Names on every point** — the clearest picture, but it publishes the
  connection graph that ADR 0004 and ADR 0053 keep private. Rejected.
- **`3d-force-graph`** — quicker to start, but it brings d3-force-3d and its
  own render loop, animates the layout as it settles, and is harder to drive
  frame by frame for a presentation. Rejected for a library and 150 lines.
- **Calendar time only, or one step per event** — the first hides the summit
  in a blink, the second hides when things happened. The blend keeps both.
- **Timestamps sent, paced in the client** — simpler, but it hands every
  member the exact time each anonymous point joined. Rejected.

## Consequences

- A member who knows the one day someone else joined, and that nobody else
  joined then, can find that point and count its lines. The day granularity
  and the pace make it harder, not impossible; on a busy network it is noise.
  If that is not acceptable, the next step is to merge thin days, not to drop
  the replay.
- A member with only a few connections of their own can name the members at
  the ends of their lines, and read those members' other lines and moons.
  Trying the preview, the maintainer found this the larger risk, so below
  `limits.networkMinOwnConnections` (5) the viewer's own lines leave the data
  altogether, as the layout would otherwise still place their connections
  beside them (R-NET-13). In the dev seed three in four members are below 5,
  so at an event most members see the network without their own lines; hosts
  can lower the number.
- Challenges circle their authors as moons, carrying only their member's
  position and a day. A moon count is one more thing a point can be known
  by, alongside its lines; the same remedy applies if it is ever too much.
- The layout is computed in the browser on every visit, and grows with the
  square of the members: about 50 ms for 250, a second for 1,000, four for
  2,000. Drawing is not the limit: every kind is one instanced mesh or line
  buffer, and moons cost under a millisecond a frame at 20,000. Past about
  1,000 members the layout wants a worker, a Barnes–Hut approximation, or
  computing once on the server.
- A WebGL scene is not testable in jsdom. The scene stays behind its
  interface, and everything that decides (timeline, pace, layout, frames, the
  player) is pure and unit-tested.

## References

Requirements: `R-NET-1`..`R-NET-15`. Spec sections: `specs/design.md` §3
(Network replay), §4 (S41), `specs/flows.md` F22. ADRs 0004, 0045, 0053.
