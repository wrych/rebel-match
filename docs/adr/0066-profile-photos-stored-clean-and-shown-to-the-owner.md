# 0066. Store profile photos clean in Postgres, shown to their owner first

- **Status:** Proposed
- **Date:** 2026-11-07
- **Deciders:** Andy Moesch

## Context

Members want a face beside their name. A photo is personal data of a new
kind: it shows a person, and a phone's picture carries metadata that can name
the camera, the time and the place it was taken. The app has no file storage;
everything lives in Postgres (ADR 0024), and the one upload so far, an event
badge logo, is cleaned on the server and kept in a column (ADR 0053). The
summit is tomorrow, and where photos should appear is not decided yet.

## Decision

- **The browser crops and scales; the server checks and cleans.** The client
  lets the member frame a square of the chosen picture, moving and zooming
  it, then draws that square at `limits.photoSidePx` and sends it as a JPEG. The server accepts only a whole
  JPEG that is square, no wider than that and no larger than
  `limits.photoMaxBytes`, and removes every `APP1`–`APP15` and `COM` segment
  before storing it: no EXIF, GPS, XMP or comment survives, whatever the
  client sent.
- **In Postgres, in a table of its own.** `member_photos` holds one `bytea`
  per member, cascading with the account, so erasure needs nothing new and
  reading a member never reads a picture.
- **Served from our origin as a picture only**, with `nosniff` and a sandboxing
  content policy, and shown through `<img>`.
- **Behind a host switch**, `limits.profilePhotos`, off by default like the
  other features added for the summit. Off hides the photo and answers its
  addresses as not found; photos already added are kept.
- **Seen by its owner only, for now.** Each place that shows a photo to
  someone else is a separate decision, recorded in requirements open
  question 10, together with the privacy notice's words.

## Alternatives considered

- **Re-encode on the server (sharp)** — the strongest cleaning, but a native
  dependency in the image the day before the summit. Walking the segments is
  a small pure function, and the client already re-encodes.
- **Object storage (Cloud Storage)** — the usual home for files, but a new
  vendor seam, credentials and a second place erasure must reach. At 512
  pixels a photo is tens of kilobytes; Postgres holds thousands of them.
- **Gravatar** — no upload at all, but it sends a hash of each email address to
  a third party, and most members have none.
- **Showing photos everywhere at once** — what members may expect, but it
  changes what other members see of them, which the privacy notice describes.

## Consequences

- Members can add a photo now; showing it elsewhere is a later, smaller change
  per screen, each reading `member_photos` behind its own visibility check.
- JPEG only: the browser converts whatever it can decode, so HEIC from an
  iPhone works where Safari decodes it, and nothing else reaches the server.
- Stripping the colour profile (`APP2`) can shift colours slightly on wide-gamut
  pictures. Accepted for a 512-pixel avatar.
- Photos grow the database and its backups by tens of kilobytes per member.

## References

Requirements: `R-PROF-5`, `R-NFR-7`, open question 10. Spec sections:
`specs/design.md` §2 `member_photos`, §3, §8. ADRs 0024, 0053.
