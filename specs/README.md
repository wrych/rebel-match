# Rebel Match — Software Specification

Spec-driven development package for **Rebel Match**, a peer-matching app for the
Corporate Rebels network. Members bring an organizational challenge and are
matched with peers who face the same thing ("same boat"), peers who have solved
it ("been there"), and curated case studies.

## Sources

This spec is derived from two inputs in the repository root:

- **`Rebel Match (beta).html`** — the clickable prototype (a self-contained
  single-page app). It defines the screens, flows, visual language, and the seed
  data (8 trends, example challenges, people, case studies).
- **`xigo - 2026_10_01 19_27 CEST - Transcript.md`** — the scoping meeting
  (Andy Moesch, Ivo Pejakovic, Pascal Dulex) that sets the beta scope, privacy
  model, auth approach, and timeline.

Where the prototype and the meeting disagree, **the meeting wins** and the
deviation is called out (the biggest one: the prototype opens a direct `mailto:`
on "Connect", but the meeting mandates a **double opt-in** before any contact
detail is shared).

## Documents

| File | Purpose |
|------|---------|
| [`requirements.md`](requirements.md) | What the system must do — user stories, acceptance criteria, scope boundaries. |
| [`priorities.md`](priorities.md) | Prioritized feature list (MoSCoW) mapped to the Nov 1 beta deadline. |
| [`design.md`](design.md) | How it is built — architecture, MySQL schema, Node.js API, screens, matching algorithm, seed data. |
| [`tasks.md`](tasks.md) | Implementation plan broken into milestones with the summit deadline. |

## Target stack

- **Server:** Node.js (Express).
- **Database:** MySQL.
- **Client:** single-page web app served by the Node server; mobile-first (the
  summit flow is "scan a QR code on your phone during the break").
- **Auth:** passwordless email magic links over a whitelist, with admin approval
  for new applicants.

## The one-paragraph summary

Corporate Rebels members log in with a magic link (invite-only whitelist). First
time in, they add their name and consent to the data-usage terms. They can
**ask for help** — write a challenge in their own words, have it auto-matched to
one of the 8 Corporate Rebels trends (correctable), and see peers in the same
boat, peers who have been there, and case studies. Or they can **offer help** —
swipe through other members' challenges and flag "same boat" or "I can share
experience". Connecting is **double opt-in**: the other person is asked first,
and only when both agree are email addresses exchanged. A "Matches" screen is
the personal cockpit for pending requests and activity.

## Deadline

Summit is **2026-11-08**. Target **feature-complete and tested by 2026-11-01**
(one week before), with a small pilot group. Ivo is unavailable from ~2026-11-15.
