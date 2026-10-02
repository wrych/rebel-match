# 0007. Addressable screens instead of modals

- **Status:** Accepted
- **Date:** 2026-10-01
- **Deciders:** Andy Moesch

## Context

The prototype put several steps in modals and bottom sheets: the connection
confirm, the revealed contact detail, the trend picker, the case-study list.
That works for a click-through demo, but the product needs to send people
somewhere — a notification about an incoming connection request should open
*that request*, not the front door. A modal has no address, so there is nothing
to link to.

The prototype's "about ten screens" was a rough guess, not a budget.

## Decision

Every step that holds content, takes input, or is worth linking to is a screen
with its own path-based URL. Overlays are reserved for interactions too small to
link to: a destructive-action confirm, a toast, an inline validation hint. The
screen count is uncapped — adding a screen beats hiding a step in an overlay.

Deep links cannot bypass the rules: an unauthenticated visitor logs in and is
returned to the target; an un-onboarded member completes onboarding first; a
non-party gets not-found; and the `next` path is validated against the route
table so it cannot become an open redirect.

## Alternatives considered

- **Modals with hash routes** — addressable in theory, but reload and back
  behaviour stay fragile, and the state lives in the opener.
- **Email links to the cockpit only** — simpler, costs the recipient a hunt
  through a list to find the request they were told about.

## Consequences

- Notification emails become useful: they link to `/matches/requests/:id` and
  carry no challenge text or contact detail.
- More routes (twenty screens where the prototype implied ten), each needing its
  own authorization check — the same check its API already performs.
- `next` handling is a security surface, so it is validated and unit-tested
  (R-QA-1).
- Browser back and reload work like a website, which is what phone users expect
  mid-break.

## References

Requirements: R-NAV-1..10. Spec: `specs/design.md` §4, `specs/flows.md` F13.
