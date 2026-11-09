# 0069. Show what changed on screen, in the chat and the pull request

- **Status:** Accepted
- **Date:** 2026-11-09
- **Deciders:** Andy Moesch

## Context

The maintainer approves most agent work, often from a phone, and most often in
the chat with the agent, before the pull request is read: "is this what you
meant?", "which of these two?". A change to a screen, a layout, an email or a
message is judged by looking at it, and neither the diff nor a summary in words
shows that. Today that means checking out the branch or adding
the `preview` label and waiting for a deployment (ADR 0028).

Agents in cloud sessions can run `npm run dev` against seeded data and capture
it with the preinstalled Chromium and Playwright. They cannot upload an image
into a pull request: GitHub takes attachments only through its web page.
Committing images to the branch puts them on `main` with the squash merge.

## Decision

- **A change that can be seen is shown, wherever it is reported**, in
  screenshots or a short video, whenever the agent can run it: the changed state; before and
  after when something was there before; phone width (390 px) and desktop
  width; light and dark when the theme matters; the empty and error states the
  change touches. A flow is a video or GIF of under 30 seconds. Screenshots are
  taken at device scale factor 2.
- **Seeded members only.** No real member's name, email, photo or text in any
  image (constitution §5: no PII outside where it belongs).
- **In the chat first.** When the agent reports a visible change, asks for
  approval or offers options, it sends the captures inline with that message,
  not a link and not "see the PR". That is where the decision is made. It sends
  them again only when the change has changed.
- **And in the pull request, never committed.** The agent publishes one
  private page (a claude.ai Artifact) with the captioned images and video and
  links it under "How it is tested"; where it cannot publish one, it says there
  that the captures were sent in the chat.
- **When it cannot capture**, it says why, in the chat and under "How it is
  tested", and never
  presents a mock-up as a capture. The `preview` label stays the way to try the
  change on a phone.
- Images are evidence, not tests; the behavior still ships with its tests.

## Alternatives considered

- **An orphan media branch** — renders inline, but the pre-push review refuses
  commits outside the checked-out branch.
- **Preview deployments by default** — ADR 0028 keeps them opt-in for cost.

## Consequences

- A visible change can be approved from the chat or the description.
- An Artifact page is private to its owner until shared; the agent says so
  when someone else reviews.
- This is a rule for every xigo project, decided there as xigOS ADR 0006; this
  copy stands until Rebel Match moves onto xigOS.

## References

xigOS ADR 0006. ADR 0028 (merging and previews), ADR 0068.
