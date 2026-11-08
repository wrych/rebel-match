# 0067. Show photos beside names, addressed by a random key

- **Status:** Accepted
- **Date:** 2026-11-07
- **Deciders:** Andy Moesch

## Context

ADR 0066 let members add a photo and kept it to its owner until the
maintainer decided where it shows. The decision: beside the name on match
cards, the deck, search results, a person's page and the host tools' member
page; as the viewer's own point in the network replay; for cast members in
the presentation. Not only to connections, and never enlarged.

The deck deliberately carries no author id (R-OFF-2), and the replay names
nobody but the viewer (ADR 0057). An address built from the member id would
put ids where there were none.

## Decision

- **A random key per photo.** `member_photos.key` is 32 random bytes,
  base64url, new with every upload. Cards that show a name carry the key as
  `photo`, or null. `GET /api/photos/:key` serves it to any signed-in,
  onboarded member while the owner is active and photos are on; anything else
  is not found. A new photo is a new address, so a photo is cached for good
  and a replaced one is never served again.
- **Hosts by id.** The member page reads `GET /api/admin/members/:id/photo`
  under the permission that reads members, whatever the member's status, as
  it shows everything held (R-MEM-2).
- **One component draws it**: the photo, or the initials where there is
  none, round, at the size the place gives it, with no link, no zoom and no
  drag.
- **The replay** draws the viewer's own point as their photo, read from
  their own profile; the timeline itself carries no photo. **The
  presentation** takes a cast member's app photo when the cast file has none.

## Alternatives considered

- **By member id** — simpler, but adds ids to the deck and lets anyone with
  an id from one place fetch the photo after its owner replaced it.
- **Inline data URLs on every card** — no second request, but a page of
  cards would carry hundreds of kilobytes on every poll.
- **Connections only** — the most private, and what emails do; the
  maintainer chose a face beside the name wherever the name is.

## Consequences

- Every card query joins `member_photos` for its key; the photo itself is
  read only when a browser asks for it.
- A key is a capability like an invite link: a member who saw a card can
  pass the address on to another member, never to someone signed out.
- The privacy notice's list of what the profile holds needs the photo; that
  wording is the maintainer's, in its own change.

## References

Requirements: `R-PROF-7`, `R-PROF-6`, `R-MEM-2`, `R-NET-2`, `R-PRES-5`,
`R-OFF-2`. ADRs 0057, 0066.
