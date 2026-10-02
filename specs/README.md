# Rebel Match — Software Specification

Spec-driven development package for **Rebel Match**, a peer-matching app for the
Corporate Rebels network. Members bring an organizational challenge and are
matched with peers who face the same thing ("same boat"), peers who have solved
it ("been there"), and curated case studies.

## Sources

This spec is derived from two inputs:

- **[`prototype/rebel-match-beta.html`](prototype/rebel-match-beta.html)** — the
  clickable prototype (a self-contained single-page app). It defines the screens,
  flows, visual language, and the seed data (8 trends, example challenges,
  people, case studies) — which now seeds **dev deployments only**.
- **`xigo - 2026_10_01 19_27 CEST - Transcript.md`** (repository root) — the
  scoping meeting (Andy Moesch, Ivo Pejakovic, Pascal Dulex) that sets the beta
  scope, privacy model, auth approach, and timeline.

Where the prototype and the meeting disagree, **the meeting wins** and the
deviation is called out (the biggest one: the prototype opens a direct `mailto:`
on "Connect", but the meeting mandates a **double opt-in** before any contact
detail is shared).

## Documents

| File                                 | Purpose                                                                                            |
| ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| [`requirements.md`](requirements.md) | What the system must do — user stories, acceptance criteria, scope boundaries.                     |
| [`priorities.md`](priorities.md)     | Prioritized feature list (MoSCoW) mapped to the Nov 1 beta deadline.                               |
| [`flows.md`](flows.md)               | Every user journey end to end — entry, onboarding, ask, offer, double opt-in connect, admin.       |
| [`design.md`](design.md)             | How it is built — architecture, MySQL schema, Node.js API, screens, matching algorithm, seed data. |
| [`tasks.md`](tasks.md)               | Implementation plan broken into milestones with the summit deadline.                               |

## Target stack

- **Server:** Node.js (Express).
- **Database:** MySQL.
- **Client:** a **Vue 3 SPA** (Vite, TypeScript, vue-router) served by the Node
  server; mobile-first, since the summit flow is "scan a QR code on your phone
  during the break". Every screen has its own URL, so emails and QR codes link
  straight to a screen — screens, not modals. One route table is shared with the
  server, so the two cannot disagree about what exists (ADR 0017).
- **Auth:** passwordless email magic links over a whitelist, with admin approval
  for new applicants. Access is **role-based** (`member`, `admin`, more later),
  enforced by permission, never by a role name.
- **Email:** the team's own SMTP server. Every message is recorded in an
  **outbound log** visible to admins in every environment — outbound mail is
  otherwise a black box. A dev deployment records but sends **nothing**, and the
  magic link stays clickable there only (ADR 0016).
- **Analytics:** Mixpanel, free tier, **EU data residency**, pseudonymous ids
  only.
- **Seeding:** per-environment — prototype fixtures for dev, the real whitelist
  and collected challenges for production, and never the two mixed.
- **Quality:** unit + API integration tests, run by GitHub Actions on every push.

## The one-paragraph summary

Corporate Rebels members log in with a magic link (invite-only whitelist). First
time in, they add their name and consent to the data-usage terms. They can
**ask for help** — write a challenge in their own words, have it auto-matched to
one of the 8 Corporate Rebels trends (correctable), and see peers in the same
boat, peers who have been there, and case studies. Or they can **offer help** —
swipe through other members' challenges and flag "same boat" or "I can share
experience". Connecting is **double opt-in**: the other person is asked first,
and only when both agree are email addresses exchanged. A "Matches" screen is
the personal cockpit for pending requests and activity. Onboarding is the
measured bottleneck: QR scan to name-and-consent must take **under 2 minutes**.

## Deadline

Summit is **2026-11-08**. Target **feature-complete and tested by 2026-11-01**
(one week before), with a small pilot group. Ivo is unavailable from ~2026-11-15.
