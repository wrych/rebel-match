# 0017. A Vue SPA, with one route table shared by client and server

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** Andy Moesch

## Context

`design.md` §1 has always said "single-page web app served by the Node server",
but it never said with what, and the choice forks more than the screens: it
decides whether `/auth/*` returns rendered pages or JSON.

The case for server rendering was real. The spec's hardest navigation rules —
remember a deep-link target, send the visitor to login, return them after verify,
let onboarding win, validate `next`, answer not-found rather than forbidden
(R-NAV-5..8) — are redirect semantics. Server-side they are one guard and a few
`303`s. Around 17 of the 22 screens are a form or a list; exactly one, the swipe
deck, is genuinely interactive. And a supertest request would _be_ a screen,
which is how R-QA-2 stays cheap.

Two things settled it the other way.

**The prototype is not reusable either way.** It is a design-tool export — 394
lines, 728 KB, escaped markup inside a `__bundler/manifest`. It is a visual
reference, not source. So "reuse the prototype" argued for neither option.

**Team fluency decides it.** The deciding factor was never the architecture: it
is what the two people with 30 days can write without thinking. That is Vue.
Choosing an unfamiliar rendering model against a fixed summit date trades a
modest architectural gain for a schedule risk, which is the wrong way round.

## Decision

A **Vue 3 single-page app** — Composition API, TypeScript, Vite, `vue-router` in
history mode so every screen has a real path (R-NAV-1). The server serves JSON
under `/api/*` and `/auth/*`, and the built shell for any client route.

The cost of an SPA is that R-NAV-5..8 now exist on **both** sides: once as client
navigation guards, once as the server checks that must hold regardless. Two
copies of a rule drift. So:

- **One route table, in TypeScript, imported by both.** The client router builds
  its routes from it; the server validates `next` against it. A path that is not
  in the table is not a route anywhere, and neither side can develop a private
  opinion about what exists (R-NAV-6).
- **The server is the authority.** Client guards are a courtesy to the user —
  they remove a flash of the wrong screen. Every `/api/*` request re-checks
  session, onboarding and permission on its own (R-ROLE-5, R-NAV-8). A guard that
  is the only thing standing between a member and someone else's data is a
  defect.
- **Not-found keeps its meaning.** An unauthorized or unknown resource under
  `/api/*` answers `404`, never `403` — it must not confirm the row exists
  (R-NAV-8). The shell itself is served `200` for any in-table path, and the
  client renders the not-found screen for anything else.

## Alternatives considered

- **Server-rendered with JS islands** — the recommendation this ADR overrides.
  Cheaper deep-link handling, fewer bytes on conference wifi, screens testable
  with supertest. Lost on fluency, which was always the deciding factor.
- **React + Vite** — technically equivalent here. Vue wins on the only axis that
  separated them for this team.
- **Vanilla TypeScript with a hand-rolled router** — no framework weight, and you
  write the router, the history handling and the guards yourself. More code for
  the same result.

## Consequences

- **Two builds.** `tsc` for the server, Vite for the client, and CI runs both.
  `npm run dev` needs the Vite dev server proxying `/api` and `/auth` to Node.
- **The bundle is in the R-NFR-3 budget.** Vue plus the router is tens of
  kilobytes before our code, over congested conference wifi, inside a two-minute
  measurement. A stated budget belongs in the client scaffold, and the QR dry run
  (M6) is what proves it.
- **Screens need their own tests.** `@vue/test-utils` with jsdom, and the guard
  logic written as pure functions so R-QA-1 can test the deep-link rules without
  a browser.
- **The duplication is real and bounded.** The shared route table removes the
  worst of it; what remains is that a guard and a server check can disagree about
  _permission_, which is why the server never trusts the guard.
- design.md §1's "SPA" is now specific, and §4's routing rules gain the client
  half.

## References

Requirements: R-NAV-1..10, R-ROLE-4,5, R-QA-1,2, R-NFR-3.
Builds on ADR 0007 (addressable screens), ADR 0011 (TypeScript strict).
Spec: `specs/design.md` §1, §4, §9.
