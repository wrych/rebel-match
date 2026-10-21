# 0054. Send every email as plain text and HTML, rendered from one description

- **Status:** Accepted
- **Date:** 2026-10-21
- **Deciders:** Andy Moesch

## Context

Every email went out as plain text only: a system font and long bare links,
nothing that says Rebel Match. `docs/email-setup.md` already asks for the
sign-in email to be multipart. An HTML part brings its own risks: the two
parts drifting apart, remote images that track readers or fail to load,
member-written names and notes turning into markup, and a sign-in link the log
must not keep (R-MSG-4).

## Decision

- **One description, two renderings.** Each sender describes its email once —
  heading, preview line, paragraphs, a member's note, the action, a short note
  under a rule, the footer — and `mail-layout.ts` renders the plain text and
  the HTML from it. A digest's entries are rows of the same description.
- **The look** (R-MSG-8): the still RR mark (`client/public/favicon.svg`) beside
  the name, a white card on cream paper, near-black ink, one ember button. A
  sign-in link is also written out in full, for clients that strip styling.
  A digest entry starts with the member it is about, in bold; the plain text
  names them plainly.
- **Nothing remote.** The mark is a PNG embedded in the message and referred to
  by `cid:`; there are no remote images, webfonts or tracking pixels. Headings
  fall back to Impact and Helvetica where Anton and Archivo are absent.
- **Tables and inline styles**, since many clients drop `<style>`; a dark
  scheme in a `<style>` block for the clients that honour it.
- **Every value is escaped** before it enters the HTML.
- **The log stores the plain text only;** the HTML is rendered for the
  transport and kept nowhere.

## Alternatives considered

- **A templating language or an email framework (MJML, React Email)** — a
  dependency and a build step for ten short emails that share one layout.
- **HTML written by hand in each sender** — the two parts drift, and every
  sender must remember to escape.
- **The mark as a remote image** — blocked by default in many clients, and a
  request that tells a server who opened what.
- **The mark as SVG** — Gmail and Outlook do not show it.

## Consequences

- An email's wording lives in its description; a change shows in both parts.
- The plain text gains a footer line, and the sign-in emails lose their "Hi,".
- The mark is a binary in source (`mail-logo.ts`); it is regenerated from
  the favicon when the mark changes.
- What an inbox shows is not covered by tests; the real-inbox check in
  `docs/email-setup.md` covers it.

## References

Requirements: `R-MSG-8`, `R-MSG-4`, `R-LOOK-1`, `R-ANA-3`. Spec sections:
`specs/design.md` §1 Mail delivery. `docs/email-setup.md`.
