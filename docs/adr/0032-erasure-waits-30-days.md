# 0032. Erasure waits 30 days, during which it can be undone

- **Status:** Accepted
- **Date:** 2026-10-05
- **Deciders:** Andy Moesch

## Context

Deleting an account erases the person and everything attached to them in one
transaction, at once and for good (R-NFR-7). A member who deletes their account
in a moment of doubt, or a host who deletes the wrong card in a bulk action,
cannot take it back. GDPR asks that erasure happen without undue delay, within
a month of the request.

## Decision

- **Deleting deactivates at once.** The member's status becomes `deleted`,
  their sessions end, and they vanish from everyone else's view: their
  challenges, cards, matches and requests are hidden, as for any member who is
  not active. Nothing is erased yet.
- **Erasure follows after `erasureGraceDays` (30).** A sweep erases each
  account whose time has come, exactly as an immediate erasure does today.
- **It can be undone until then, two ways:**
  - **By the person, for a deletion they made themselves:** asking for a sign-in link with their address answers
    as for any member ("check your email"), and the email says the account is
    set to be deleted, when, and carries a link to keep it. Following that
    link restores the account and signs them in. Only someone who can read the
    inbox learns of the deletion or can undo it. A deletion a host made, for
    abuse say, the person cannot undo: asking for a link answers the same way
    and sends nothing.
  - **By a host, for any deletion:** the member's page shows the date and
    offers to restore it.
- **A host may erase at once** when someone insists, from the member's page.
- The refusals stay: the last who can grant roles, or someone whose invite
  links remain, cannot be deleted.
- This applies to every deletion: the member's own and a host's, singly or in
  a selection.

## Alternatives considered

- **Erase at once (as before)** — simple, but a slip is permanent.
- **Undo by host only** — the person who changed their mind has to find and
  email someone.
- **Keep their content visible meanwhile** — a deleted account would still be
  matched and contacted.

## Consequences

- Personal data stays in the database for up to 30 days after a request,
  within GDPR's month; the consent text needs no change for that.
- The login screen answers a deleted account as it answers an active one, so
  it discloses no more than it already does (ADR 0013); only the inbox hears
  of the deletion. A keep-it link is a magic link of a new kind, `restore`,
  with the sign-in link's lifetime.
- A sweep runs on the server, beside the outbound log's retention purge.

## References

Amends the immediate erasure of R-NFR-7, R-PROF-2,
R-MEM-2 and R-MEM-3. Requirements: R-NFR-7, R-PROF-2, R-MEM-2, R-MEM-3.
Spec: `specs/design.md` §2, §3, §8; `specs/flows.md` F11.
