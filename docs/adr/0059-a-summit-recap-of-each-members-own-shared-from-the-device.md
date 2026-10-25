# 0059. Give each member a summit recap of their own, shared from their device

- **Status:** Accepted
- **Date:** 2026-10-25
- **Deciders:** Andy Moesch

## Context

Having seen the presentation, the maintainer wants every member to get a
review of their own time in the movement when the summit ends, in the
manner of a streaming service's yearly review: phone-sized stories,
comparisons with everyone, and a card to share, LinkedIn first. Badges are private (ADR 0053), the replay
names nobody (ADR 0057), and members hold sensitive problems here.

## Decision

- **Portrait stories**, not a film: tap forward and back, hold to pause,
  each story moving on by itself, on a screen of its own behind a switch
  hosts hold.
- **Their own figures only**, from the badges' counts, with the highest level
  and the crowns they hold. The replay's network closes it, under its rules.
- **Comparisons as a share of members below them**, rounded down to steps of
  5%, and none while fewer than 20 members are active. Crowns already say
  who leads; a share says where everyone else stands without naming anyone.
- **The card is drawn in the browser** and holds only the member's name,
  figures, levels, crowns and the mark: no other name, no challenge text, no
  network picture.
- **Shared from the device.** Where the phone can share files, the card and a
  written post go to its share sheet, where LinkedIn is one choice among
  others; elsewhere the card is saved and LinkedIn's composer opens with the
  post. There is no public page of a member's figures and no call to
  LinkedIn from the app.

## Alternatives considered

- **A film like the presentation** — made for a stage, not a phone in a hand.
- **A public page with a preview image for LinkedIn** — the smoothest post,
  but it publishes a member's figures at an address anyone can open, and
  needs a page outside the session. Rejected.
- **LinkedIn's API** — an app registration, member authorisation and a token
  to hold, for one post a year. Rejected.
- **Ranks ("you are 4th")** — they name a position others can work out from;
  a share of members below says enough.

## Consequences

- On a laptop sharing takes two steps: the member attaches the saved image to
  the post LinkedIn opens with. On phones it is one step.
- LinkedIn's composer address is not a documented interface; if it changes,
  the fallback still saves the card and the member posts it by hand.
- Members see it as _Your rebel record_. A first idea echoed a streaming
  service's trademarked campaign name; the title is one constant,
  `RECAP_TITLE`, and the code says recap throughout, so renaming stays a
  one-line change.
- What a member shares is theirs to share. The card is built so that what it
  carries is only theirs.

## References

Requirements: `R-RECAP-1`..`R-RECAP-7`. Spec sections: `specs/design.md` §1
(summit recap), §3, §4 (S43), §7, `specs/flows.md` F24. ADRs 0053, 0057.
