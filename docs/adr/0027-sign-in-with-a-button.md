# 0027. Sign in with a button, never by opening the link

- **Status:** Accepted, amended by 0034
- **Date:** 2026-10-04
- **Deciders:** Andy Moesch

## Context

ADR 0003 made the magic link the whole of sign-in: `GET /auth/verify?token=…`
used the token and set the session cookie. Anything that opens the link
therefore signs in, and spends it.

Plenty opens links that is not the member. WhatsApp fetched a staging link to
build its preview, and the maintainer, tapping it a moment later, was told it
had already been used. Corporate mail filters (Microsoft Defender Safe Links,
Proofpoint, Mimecast) open every link in incoming mail, many of them in a real
headless browser that runs scripts. Summit attendees read their mail on
company accounts, so the link that is the whole of R-NFR-3's two minutes would
arrive spent, and only in production, since nothing else sends mail.

Scanners cannot be told apart from people: they send a normal browser's user
agent, run JavaScript, and come from cloud addresses that real users share.

## Decision

- **Opening a link uses nothing.** The emailed link is `/sign-in#token=…`: a
  screen with a **Sign in** button. The token is in the fragment, so it is not
  even sent to the server, or written to its request log, when the page loads.
- **Only a deliberate action uses it.** The button sends `POST /auth/verify`
  with the token; that validates and consumes it, creates the session and
  answers where to go next. A dead token answers its reason, and the screen
  sends the member to the login notice R-AUTH-6 already shows.
- **No timer and no auto-submit.** Mail sandboxes fast-forward timers and wait
  out delays, because malware uses them; a countdown would spend the link
  inside the scanner again. A button is what they do not press.
- `GET /auth/verify?token=…` stays for links already sent, and only redirects
  into the sign-in screen.

## Alternatives considered

- **Auto-submit with script, or after a countdown** — no extra tap, but a
  scanner that runs scripts or skips timers signs in with the link, and the
  member gets "already used".
- **Detect scanners by user agent or IP range** — guesswork that breaks
  silently, and fails either the scanner check or real members.
- **A typed code instead of a link** — robust against any scanner, slower on a
  phone. Kept in reserve as a fallback next to the button if scanners turn out
  to press buttons.

## Consequences

- One more tap on the path R-NFR-3 times. It is the cheapest part of the two
  minutes.
- A link previewed in a chat or scanned by a mail filter still works when the
  member taps it.
- The sign-in screen is a public route, and its token lives only in the
  browser until the member confirms.

## References

Amends ADR 0003. Requirements: R-AUTH-5, R-AUTH-6, R-NFR-3, R-NAV-5, R-NAV-6.
Spec: `specs/design.md` §3 and the screen list, `specs/flows.md` F1.
