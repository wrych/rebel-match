# 0069. Pull requests show what changed on screen

- **Status:** Accepted
- **Date:** 2026-11-09
- **Deciders:** Andy Moesch

## Context

The maintainer approves most agent pull requests, often from a phone. A change
to a screen, a layout, an email or a message is judged by looking at it, and
the diff does not show that. Today that means checking out the branch or adding
the `preview` label and waiting for a deployment (ADR 0028).

Agents in cloud sessions can run `npm run dev` against seeded data and capture
it with the preinstalled Chromium and Playwright. They cannot upload an image
into a pull request: GitHub takes attachments only through its web page.
Committing images to the branch puts them on `main` with the squash merge.

## Decision

- **A pull request whose change can be seen shows it**, in screenshots or a
  short video, whenever the agent can run it: the changed state; before and
  after when something was there before; phone width (390 px) and desktop
  width; light and dark when the theme matters; the empty and error states the
  change touches. A flow is a video or GIF of under 30 seconds. Screenshots are
  taken at device scale factor 2.
- **Seeded members only.** No real member's name, email, photo or text in any
  image (constitution §5: no PII outside where it belongs).
- **Never committed.** The agent publishes one private page (a claude.ai
  Artifact) with the captioned images and video, links it under "How it is
  tested", and sends the files to the maintainer in the session.
- **When it cannot capture**, it says why under "How it is tested", and never
  presents a mock-up as a capture. The `preview` label stays the way to try the
  change on a phone.
- Images are evidence, not tests; the behavior still ships with its tests.

## Alternatives considered

- **An orphan media branch** — renders inline, but the pre-push review refuses
  commits outside the checked-out branch.
- **Preview deployments by default** — ADR 0028 keeps them opt-in for cost.

## Consequences

- A visible change can be approved from the description.
- An Artifact page is private to its owner until shared; the agent says so
  when someone else reviews.
- This is a rule for every xigo project, decided there as xigOS ADR 0006; this
  copy stands until Rebel Match moves onto xigOS.

## References

xigOS ADR 0006. ADR 0028 (merging and previews), ADR 0068.
