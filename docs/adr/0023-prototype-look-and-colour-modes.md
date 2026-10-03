# 0023. Wear the prototype's look, with happy mode as a colour mode

- **Status:** Accepted
- **Date:** 2026-10-03
- **Deciders:** Andy Moesch

## Context

The beta was going to be plain: the prototype's corporate↔rebel "CR" toggle
(happy mode) was listed as prototype-only fun with no product value (W2). Ahead
of showing the app, the maintainer asked for the prototype's look across every
screen, tried the result, and wanted to keep happy mode too. The look needs
three typefaces, and loading them from a public font host would send every
visitor's address to that host, which an EU audience at a summit should not
have to accept.

## Decision

The client wears the prototype's design language (R-LOOK-1), and happy mode
stays as an optional colour mode behind the CR button (R-LOOK-2). A mode is a
set of colour tokens over one set of components, switched by a `data-mood`
attribute and remembered per browser; it never changes content or behaviour
(R-LOOK-3). Fonts are self-hosted through `@fontsource`. Happy mode moves from
Won't-have W2 to Could-have C6; a dark mode, built the same way, is C7 for later.

## Alternatives considered

- **Calm look only, as the specs had it** — honest to W2, and loses something
  the maintainer and the prototype's audience liked, for one token block of cost.
- **Modes as separate stylesheets or components** — duplicates every screen and
  lets modes drift apart; tokens keep one source of layout.
- **Fonts from a public font CDN** — less to ship, and every page view would
  reach a third party with the visitor's address.

## Consequences

- Every component reads colours only through tokens. A hard-coded colour in a
  screen breaks every mode but the one it was picked for.
- Each new mode must be checked for readable contrast (R-LOOK-3).
- The app ships its fonts, about 300 KB of files, served from our own origin.
- The mode choice lives in the browser only: it is a convenience, not a member
  setting, and is lost with the browser's storage.

## References

Requirements: `R-LOOK-1`, `R-LOOK-2`, `R-LOOK-3`. Priorities: C6, C7 (was W2).
Spec: `specs/design.md` §1 "Look and colour modes". Prototype:
`specs/prototype/rebel-match-beta.html`.
