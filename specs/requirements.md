# Rebel Match — Requirements

Status: Draft for beta (summit launch 2026-11-08).
Audience: implementers building against a Node.js + MySQL stack.

Acceptance criteria use EARS phrasing: **WHEN** <trigger> **THE SYSTEM SHALL**
<response>, or **WHILE** <state> / **IF** <condition> **THEN THE SYSTEM SHALL**.

---

## 1. Product goals

1. Let Corporate Rebels members find peers for a specific organizational
   challenge, fast enough to use during a one-hour conference break.
2. Protect member privacy: challenges can be sensitive, and no contact detail is
   shared without explicit consent from both sides.
3. Ship a small, testable beta — roughly ten screens — not a platform.

### Non-goals (explicitly out of scope for beta)

- Integration with the existing Corporate Rebels member platform. *(Meeting:
  "let's make that explicit — we're not aiming for integration in the corporate
  platform because that would be probably significant work.")*
- Gamification: standings, badges, ranks, milestone pop-ups. *(Meeting: "I would
  also focus on sharing experience and sharing problems and not the
  gamification.")*
- The corporate↔rebel theme toggle ("CR" button / happy mode). Prototype-only fun.
- "Nominate as frontier" escalation flow.
- Connecting by phone number or LinkedIn. Email only for beta.
- AI/LLM-based matching of challenges to case studies. Beta uses the curated,
  per-trend case list and keyword-based trend detection.

---

## 2. Users and roles

- **Member** — a whitelisted person who can log in, post challenges, offer help,
  and connect.
- **Applicant** — someone who requested access but is not yet approved. Cannot
  log in until an admin approves them.
- **Admin** — a member who can approve/reject applicants and manage the
  whitelist.

---

## 3. Authentication & onboarding

### 3.1 Whitelist & access

- **R-AUTH-1** — The system SHALL restrict login to email addresses on an
  approved whitelist (seeded from invited summit attendees).
- **R-AUTH-2** — WHEN a non-whitelisted email requests access THE SYSTEM SHALL
  record it as a pending **applicant** and notify an admin, rather than granting
  access.
- **R-AUTH-3** — WHEN an admin approves an applicant THE SYSTEM SHALL move them
  to active and allow magic-link login. WHEN an admin rejects an applicant THE
  SYSTEM SHALL prevent login and retain no challenge data for them.

### 3.2 Magic-link login

- **R-AUTH-4** — WHEN a user submits a whitelisted email on the login screen THE
  SYSTEM SHALL email them a single-use magic link and show a "check your email"
  state. *(Meeting: "something like a magic link that is then sent to your email…
  really simple user management.")*
- **R-AUTH-5** — The magic link SHALL be single-use and SHALL expire (default 15
  minutes). WHEN a user opens a valid, unexpired, unused link THE SYSTEM SHALL
  create an authenticated session and consume the token.
- **R-AUTH-6** — IF a user opens an expired, used, or unknown link THEN THE
  SYSTEM SHALL show an error and offer to resend a new link.
- **R-AUTH-7** — The system SHALL keep the user signed in via a session that
  survives closing and reopening the browser (so a phone user mid-break is not
  logged out), until they explicitly log out.
- **R-AUTH-8** — The system SHALL NOT require a password at any point.

### 3.3 First-time onboarding

- **R-ONB-1** — WHEN an authenticated user has no profile name yet THE SYSTEM
  SHALL present a first-time onboarding screen before any other screen.
- **R-ONB-2** — The onboarding screen SHALL collect the member's **display name**
  (required) and MAY collect role and organization (optional, used in match
  cards).
- **R-ONB-3** — The onboarding screen SHALL present the **data-usage consent**
  and require explicit acceptance before continuing. THE SYSTEM SHALL record the
  consent version and timestamp.
- **R-ONB-4** — IF the user has not accepted the current consent version THEN THE
  SYSTEM SHALL block access to the main app and re-present the consent.
- **R-ONB-5** — The consent copy SHALL state plainly that **email addresses are
  shared with another member only when both sides accept a connection**, and that
  the app is closed to whitelisted members only. *(Meeting: "we need to make it
  very explicit that the emails will be shared when you connect.")*

---

## 4. Ask for help (challenge author journey)

### 4.1 Submit a challenge

- **R-ASK-1** — The system SHALL let a member write **one challenge in free
  text**, in their own words, with guidance prompts (what they observe, what they
  want to change, where they struggle).
- **R-ASK-2** — The system SHALL offer example challenges the member can insert
  as a starting point.
- **R-ASK-3** — WHILE the challenge text is shorter than 12 characters THE SYSTEM
  SHALL keep the submit/analyze action disabled.
- **R-ASK-4** — WHEN the member submits THE SYSTEM SHALL persist the challenge and
  proceed to trend categorization.

### 4.2 Trend categorization

- **R-ASK-5** — WHEN a challenge is submitted THE SYSTEM SHALL auto-assign it to
  exactly one of the **8 Corporate Rebels trends** using keyword detection (see
  `design.md` §matching). *(Meeting: Andy — "It works really nice… good enough for
  the beta." Keep it, start simple.)*
- **R-ASK-6** — The system SHALL show the assigned trend, what it moves *from*
  (e.g. "Secrecy → Radical Transparency"), and how many peers work on it, and
  SHALL let the member **override** it by picking any of the 8 trends.
- **R-ASK-7** — WHEN the member confirms the trend THE SYSTEM SHALL store the
  final trend and show matches.

### 4.3 Matches for a challenge

- **R-ASK-8** — The matches view SHALL show three sections for the challenge's
  trend:
  - **Same boat** — members with a challenge in the same trend (peers facing it
    now).
  - **Been there** — members who offer experience in that trend.
  - **Case studies** — curated Corporate Rebels case links for that trend.
- **R-ASK-9** — The system SHALL let the member **follow** the trend to be
  notified of future challenges in it.
- **R-ASK-10** — Each "same boat" and "been there" peer card SHALL expose a
  **Connect** action governed by the double opt-in flow (§6), not a direct email.

---

## 5. Offer help (swipe journey)

- **R-OFF-1** — The system SHALL present other members' challenges as a swipeable
  deck (one card at a time, swipe or arrow navigation), excluding the viewer's
  own challenges.
- **R-OFF-2** — Each card SHALL show the challenge text, its trend, author, and
  organization/sector.
- **R-OFF-3** — For each card the member SHALL be able to:
  - **Same boat** — "I'm facing this too" (a same-boat connection request).
  - **Been there** — "I can share experience" (an offer-help connection request,
    with an optional note).
  - **Follow this topic** — follow the card's trend.
  - **Skip** — advance without acting.
- **R-OFF-4** — WHEN the member chooses "Been there" THE SYSTEM SHALL let them add
  a short note (min 5 characters) describing what they can offer before sending.
- **R-OFF-5** — WHEN the deck is exhausted THE SYSTEM SHALL show an empty state
  summarizing the session and inviting the member to submit their own challenge.

---

## 6. Connecting — double opt-in (privacy-critical)

This replaces the prototype's direct `mailto:`. *(Meeting, Ivo: "probably this is
needed, not optional — that first the app asks the other person, hey do you want
to get in touch with this person, and then you send an email." Andy: "if we do
that we need to make it very explicit that the emails will be shared when you
connect.")*

- **R-CONN-1** — WHEN a member initiates a connection (same boat or been there)
  THE SYSTEM SHALL create a **pending connection request** to the target member
  and SHALL NOT reveal either party's email at this point.
- **R-CONN-2** — The system SHALL notify the target member (in-app and by email)
  that someone wants to connect, including the requester's message/offer note and
  the relevant challenge/trend, but **not** the requester's email address.
- **R-CONN-3** — WHEN the target member **accepts** THE SYSTEM SHALL mark the
  request accepted and reveal **each party's email address to the other**, and
  SHALL offer a pre-filled mailto so either side can write the first message.
- **R-CONN-4** — WHEN the target member **declines** (or ignores) THE SYSTEM SHALL
  keep both email addresses private and close the request.
- **R-CONN-5** — The system SHALL prevent duplicate pending requests between the
  same two members for the same challenge.
- **R-CONN-6** — Email addresses SHALL only ever be exchanged between two
  whitelisted members who have both opted in. The system SHALL NOT expose a
  member directory or bulk contact export.

---

## 7. Matches cockpit

- **R-MINE-1** — The system SHALL provide a "Matches" screen that shows the
  member's own posted challenge(s) with per-challenge counts (same boat / been
  there / case studies) and a way to reopen the matches view.
- **R-MINE-2** — The "Matches" screen SHALL list **incoming connection requests
  waiting for the member** with Accept / Decline actions (this is where R-CONN-3
  / R-CONN-4 are triggered).
- **R-MINE-3** — The system SHALL show which trends the member is following.
- **R-MINE-4** — The navigation SHALL badge the "Matches" tab when there are
  pending incoming requests or new matches.

---

## 8. Feedback

- **R-FB-1** — The system SHALL provide a feedback affordance that lets a member
  send feedback (pre-filled with the current screen/context) to the product
  owner. A `mailto:` is acceptable for beta.

---

## 8a. Usage analytics

The team wants to see how the app is actually used at the summit (which journey
people pick, where they drop off, how many challenges/connections happen) —
Mixpanel-style event analytics, on a free tool. See `design.md` §analytics for
the tooling choice (**PostHog**, free tier / EU cloud, self-host fallback).

- **R-ANA-1** — The system SHALL capture product-analytics **events** for the key
  funnel: login completed, onboarding completed, challenge submitted, trend
  confirmed/overridden, swipe actions (same boat / been there / skip / follow),
  connection requested, connection accepted/declined, feedback opened.
- **R-ANA-2** — Analytics SHALL be attributable to a stable, **pseudonymous**
  member id (not raw email) so funnels and retention work without spreading PII
  into the analytics tool.
- **R-ANA-3** — The system SHALL NOT send challenge text, names, or email
  addresses to the analytics tool. Event properties SHALL be limited to
  non-identifying metadata (trend id, action type, screen, counts, timestamps).
- **R-ANA-4** — The analytics tool and its data use SHALL be covered by the
  data-usage consent (§3.3). IF a member declines non-essential analytics (where
  consent is granular) THEN THE SYSTEM SHALL disable analytics capture for them.
- **R-ANA-5** — The chosen tool SHALL have a usable free tier at summit scale
  (hundreds of users, thousands of events) and SHOULD support EU data hosting.

## 9. Non-functional requirements

- **R-NFR-1 (Privacy)** — Challenge text and member contact details SHALL be
  visible only to authenticated, whitelisted members, and contact details only
  after mutual opt-in. No public/unauthenticated page exposes member data.
- **R-NFR-2 (Mobile-first)** — All member-facing screens SHALL be usable on a
  phone in portrait, since the launch mechanic is scanning a QR code during a
  break.
- **R-NFR-3 (Onboarding speed)** — A first-time member SHALL be able to go from
  magic link to a submitted challenge in well under five minutes.
- **R-NFR-4 (Capacity)** — The beta SHALL comfortably handle the summit cohort:
  up to ~350 members and a few hundred challenges/connection requests. No
  horizontal scaling required.
- **R-NFR-5 (Data protection)** — Magic-link tokens SHALL be stored hashed, never
  in plaintext. Sessions SHALL use signed, http-only cookies. Secrets (SMTP,
  session key, DB credentials) SHALL come from environment configuration, not
  source.
- **R-NFR-6 (Auditability of consent)** — The system SHALL retain, per member,
  the consent version and acceptance timestamp.
- **R-NFR-7 (Deletion)** — The system SHALL support deleting a member and their
  challenges/requests on request (GDPR erasure), at minimum via an admin action.

---

## 10. Seed content (from the prototype)

The beta SHALL ship with the prototype's curated content as the baseline, so it
is demonstrable without waiting for user-generated data. `design.md` lists the
exact seed records.

- The **8 trends** (number, short name, "from" label, peer count, keywords).
- Per-trend **case studies** (organization, Corporate Rebels URL, takeaway).
- Optionally, a set of **seed challenges/people** so the swipe deck and match
  lists are non-empty at launch. ~15 real challenges were already collected for
  the summit and MAY replace the fictional seeds. *(Meeting: "around 15 or so"
  real challenges already came in.)*

---

## 11. Open questions

1. **Email delivery provider** — which SMTP/transactional service (and sending
   domain) for magic links and connection notifications?
2. **Consent text** — who owns the legal/data-usage copy and its versioning?
3. **Admin UI depth** — is a minimal approvals list enough for beta, or is a
   fuller admin screen needed?
4. **Seed data** — ship the fictional prototype people, the ~15 real collected
   challenges, or both?
5. **Notifications** — are email notifications for incoming requests required at
   launch, or is in-app only acceptable for the summit (everyone is in the room)?
