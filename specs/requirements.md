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

**Access is role-based.** The beta ships two roles, but the model SHALL allow more
(e.g. `moderator`) to be added without changing the schema or the guards.

- **Applicant** — someone who requested access but is not yet approved. Has no
  role yet and cannot log in until approved.
- **`member`** — a whitelisted person who can log in, post challenges, offer help,
  and connect. Every active member holds this role.
- **`admin`** — holds `member` **plus** the administrative permissions: review
  applicants, manage the whitelist, delete a member (GDPR).
- *(later)* **`moderator`**, or anything else — added as a role with its own
  permission set, not as another flag.

Requirements:

- **R-ROLE-1** — Access SHALL be modeled as **named roles**, not boolean flags on
  the member record. THE SYSTEM SHALL NOT use an `is_admin`-style column.
- **R-ROLE-2** — A member SHALL be able to hold **more than one role**; their
  effective permissions are the union of their roles' permissions.
- **R-ROLE-3** — Authorization checks SHALL test a **permission**, never a role
  name, so introducing a role does not require editing existing guards.
- **R-ROLE-4** — THE SYSTEM SHALL expose the signed-in member's roles and resolved
  permissions to the client, so the UI can hide actions the member cannot
  perform.
- **R-ROLE-5** — Hiding an action in the UI SHALL NOT be the only protection: the
  server SHALL enforce every permission on every request (R-NFR-1).
- **R-ROLE-6** — Adding a role SHALL require no database schema change and no new
  column — only a role record and its permission mapping.
- **R-ROLE-7** — Role grants SHALL be auditable: the system SHALL record when a
  role was granted and by whom.
- **R-ROLE-8** — The term "role" in the data model SHALL refer to access roles
  only. A member's **job title** is profile data and SHALL be named distinctly
  (`job_title`) to avoid the collision.

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
  (required) and MAY collect **job title** and organization (optional, used in
  match cards). "Job title" is profile text and is unrelated to access roles
  (R-ROLE-8).
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
- **R-ASK-2** — The system SHALL show example challenges as **inspiration only**:
  short, read-only hints of the kind of thing that belongs here. THE SYSTEM SHALL
  NOT offer to insert or prefill an example into the member's text, so members
  describe their own situation instead of submitting boilerplate. *(Rationale: a
  one-tap "use this example" invites a deck full of identical stock challenges,
  which would make matching meaningless.)*
- **R-ASK-3** — WHILE the challenge text is **30 characters or shorter** THE
  SYSTEM SHALL keep the submit/analyze action disabled, so the matcher has enough
  words to work with. The screen SHALL show a character counter.
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
- **R-OFF-4** — WHEN the member chooses "Been there" THE SYSTEM SHALL require a
  note of **more than 30 characters** describing what they can offer before
  sending, so the recipient gets something substantive rather than "happy to
  help". WHILE the note is 30 characters or shorter THE SYSTEM SHALL keep the
  send action disabled, with a visible character counter.
- **R-OFF-5** — WHEN the deck is exhausted THE SYSTEM SHALL show an empty state
  summarizing the session and inviting the member to submit their own challenge.
- **R-OFF-6 (Easter egg)** — WHILE the empty state is showing, IF the member
  swipes or taps once more on the empty card THEN THE SYSTEM SHALL reveal a
  hidden **"Trend 0 — Trust"** card: *from Rules → to Trust · peers: everyone in
  the room*, with a line crediting the Corporate Rebels bucket list. Rules:
  - It is cosmetic only. Swiping it SHALL NOT create a swipe record, a connection
    request, or a follow, and SHALL NOT be reachable from the normal deck.
  - It SHALL be dismissible, SHALL NOT block the "submit your own challenge"
    call to action, and SHALL be reachable by keyboard and announced to screen
    readers like any other card (R-NFR-2).
  - It MAY emit a single non-identifying analytics event (`easter_egg_found`) and
    nothing else (R-ANA-3).

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
the tooling choice (**Mixpanel**, free tier, EU data residency; PostHog as
fallback).

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
  (hundreds of users, thousands of events) and SHALL store event data in the EU.
  *(Resolved: Mixpanel offers EU data residency on the free plan at no extra
  cost — see `design.md` §7.)*

---

## 8b. URL navigation & deep links

The app is a single-page app, but it SHALL behave like a normal website: every
screen has an address, so emails, QR codes, and chat messages can point straight
at a screen instead of at the front door.

- **R-NAV-1** — Every member-facing screen SHALL have its own **path-based URL**
  (not a hash fragment). Browser back/forward and reload SHALL land on the same
  screen with the same state.
- **R-NAV-2 (Screens, not modals)** — Any step that holds content, takes input,
  or is worth linking to SHALL be a **screen with its own URL**, not a modal or
  sheet. Overlays SHALL be limited to interactions too small to link to: a
  destructive-action confirm, a toast, an inline validation hint. In particular
  the connection request, the incoming request, the revealed contact detail, the
  trend picker, the case-study list, and the "been there" note SHALL each be
  addressable.
- **R-NAV-3** — The number of screens is **not capped**. `design.md` §4 lists the
  current set; adding a screen is preferable to hiding a step in an overlay.
- **R-NAV-4** — The system SHALL implement this URL scheme (see `design.md` §4
  for the full screen list):

  | URL | Screen |
  |-----|--------|
  | `/` | entry: routes to login, onboarding, or welcome |
  | `/login` | login / "check your email" |
  | `/auth/verify?token=…` | magic-link landing |
  | `/onboarding` | name + consent |
  | `/welcome` | two doors |
  | `/ask` | submit a challenge |
  | `/challenges/:id` | detected trend for that challenge |
  | `/challenges/:id/trend` | trend picker |
  | `/challenges/:id/matches` | same boat / been there / cases |
  | `/challenges/:cid/connect/:memberId` | connection request |
  | `/trends/:trendId` | trend detail + case studies |
  | `/offer` | swipe deck |
  | `/offer/:challengeId/note` | write a "been there" note |
  | `/offer/done` | empty deck / session summary |
  | `/matches` | cockpit |
  | `/matches/requests/:id` | one request (pending, or accept/decline) |
  | `/matches/requests/:id/contact` | contact detail, accepted requests only |
  | `/admin/applicants` | admin approvals |
  | `/admin/outbox` | dev outbox (dev deployments only) |

- **R-NAV-5** — WHEN an unauthenticated visitor opens any deep link THE SYSTEM
  SHALL show the login screen and, after a successful magic-link verify, send
  them to the **originally requested URL** rather than the generic welcome
  screen.
- **R-NAV-6** — The redirect target SHALL be validated as a **relative in-app
  path**. IF it is absolute, external, or otherwise unrecognized THEN THE SYSTEM
  SHALL fall back to `/` (no open redirect).
- **R-NAV-7** — A deep link SHALL NOT bypass onboarding: IF the member has not
  completed name + consent THEN THE SYSTEM SHALL present onboarding first and
  continue to the target afterwards (R-ONB-1, R-ONB-4).
- **R-NAV-8** — A deep link SHALL NOT bypass authorization. IF the member is not
  the owner of, or a party to, the linked challenge or connection THEN THE SYSTEM
  SHALL behave as if it does not exist, and SHALL NOT reveal that it exists
  (R-NFR-1).
- **R-NAV-9** — Notification emails SHALL link directly to the relevant in-app
  URL (e.g. `/matches/requests/:id` for an incoming request). Email bodies SHALL
  NOT contain challenge text, member names beyond the recipient's own, or contact
  details — the link leads to the app, where the normal privacy rules apply
  (R-CONN-2, R-NFR-1).
- **R-NAV-10** — The summit QR code SHALL point at the app root (optionally with a
  non-identifying campaign parameter for analytics) and follow the same routing.

---

## 8c. Development deployment

- **R-DEV-1** — WHILE running as a development deployment THE SYSTEM SHALL NOT
  send outbound email. Every message that would be sent SHALL be captured in a
  local **outbox** instead.
- **R-DEV-2** — The admin interface SHALL include an **outbox screen** listing
  captured messages newest first with recipient, subject, timestamp, and body,
  and SHALL render the magic link as a **clickable and copyable** link — so a
  developer can log in as any seeded member without a mailbox.
- **R-DEV-3** — The outbox SHALL exist only in a development deployment. IF the
  outbox routes or screen are requested in production THEN THE SYSTEM SHALL
  respond as not found, so live magic links are never browsable (R-NFR-5).
- **R-DEV-4** — Switching mail behavior SHALL be configuration, not a code
  change (a mail-transport setting), so the same build runs in both
  environments.

---

## 8d. Configurable limits

- **R-CFG-1** — Content thresholds and timings SHALL live in a **single
  configuration file**, not be hard-coded at their use sites. At minimum:
  minimum challenge length (R-ASK-3), minimum "been there" note length
  (R-OFF-4), magic-link token lifetime (R-AUTH-5), and the current consent
  version (R-ONB-3).
- **R-CFG-2** — Client and server SHALL read the **same** values, so the
  disabled-button rule on screen and the server-side validation can never
  disagree. The server SHALL expose them to the client rather than the client
  keeping its own copy.
- **R-CFG-3** — Server-side validation SHALL still enforce every threshold
  independently of the client (R-NFR-5): the config removes duplication, it does
  not remove the server check.
- **R-CFG-4** — Changing a threshold SHALL NOT require code changes beyond that
  file, so the values can be tuned during the pilot without a redeploy of logic.

---

## 8e. Testing & build pipeline

- **R-QA-1 (Unit tests)** — The application SHALL have **unit tests**, run with a
  single command (`npm test`). At minimum the following SHALL be covered, because
  they are where a silent regression hurts most:
  - the **trend matcher** (keyword scoring, ties, no-hit fallback — R-ASK-5),
  - **magic-link token** handling (hashing, single use, expiry — R-AUTH-5,6),
  - the **permission resolver** (roles → permissions, multi-role union, denial —
    R-ROLE-2,3,5),
  - the **double opt-in rules**: a contact detail is returned only for an
    accepted request to one of its two parties, and never otherwise
    (R-CONN-3,4,6, R-NFR-1),
  - **`next` path validation** (relative-only, no open redirect — R-NAV-6),
  - the **config thresholds** being enforced server-side (R-CFG-3).
- **R-QA-2 (Integration tests)** — The auth + onboarding path and the connection
  double opt-in path SHALL additionally be covered end to end at the API level
  against a test database, since they span several endpoints.
- **R-QA-3 (CI pipeline)** — The repository SHALL have a **GitHub Actions**
  workflow that runs on every push and pull request and executes: dependency
  install, lint, unit tests, integration tests, and a production build. A failing
  job SHALL fail the check.
- **R-QA-4 (Migrations in CI)** — CI SHALL run the database migrations from
  scratch against a disposable MySQL service, so a broken migration is caught
  before deployment.
- **R-QA-5 (No secrets in CI)** — CI SHALL use non-production, synthetic
  configuration only. Real SMTP credentials, the Mixpanel production token, the
  session secret, and the real attendee whitelist SHALL NOT be available to the
  test workflow (R-NFR-5, R-SEED-5).
- **R-QA-6 (Green before launch)** — The pipeline SHALL be green on `main` as part
  of "feature-complete and tested" by 2026-11-01.

---

## 9. Non-functional requirements

- **R-NFR-1 (Privacy)** — Challenge text and member contact details SHALL be
  visible only to authenticated, whitelisted members, and contact details only
  after mutual opt-in. No public/unauthenticated page exposes member data.
- **R-NFR-2 (Mobile-first)** — All member-facing screens SHALL be usable on a
  phone in portrait, since the launch mechanic is scanning a QR code during a
  break.
- **R-NFR-3 (Onboarding speed)** — A first-time member SHALL be able to get from
  scanning the QR code to a completed onboarding screen (display name entered,
  consent accepted) in **less than 2 minutes**, measured on a phone over
  conference wifi. The measured path is: scan QR → enter email → receive and open
  the magic link → submit name + consent. Magic-link email delivery is part of
  this budget and SHOULD reach the inbox within 30 seconds of the request.
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

## 10. Seed content

Seeding is **environment-specific**: a dev deployment and production never share
fixtures. `design.md` §6 lists the exact records and the profile mechanism.

- **R-SEED-1 (Shared content)** — Both environments SHALL be seeded with the
  **role records** (`member`, `admin`) and the curated product content: the **8
  trends** (number, short name, "from" label, peer count, keywords) and the
  per-trend **case studies** (organization, Corporate Rebels URL, takeaway), so
  the app is demonstrable without user-generated data.
- **R-SEED-2 (Dev seed)** — A dev deployment SHALL be seeded from the prototype
  (`prototype/rebel-match-beta.html`): the fictional roster, their experience
  notes and challenges, and the example challenges — enough for a non-empty
  swipe deck and match lists on first run.
- **R-SEED-3 (Production seed)** — Production SHALL be seeded with real content
  only: the **invited-attendee whitelist** and the **~15 real collected
  challenges** with their trend assignments. *(Meeting: "around 15 or so" real
  challenges already came in.)*
- **R-SEED-4 (No fictional data in production)** — THE SYSTEM SHALL NOT load dev
  fixtures into production. IF the seed runner is invoked with the dev profile
  WHILE the environment is production THEN THE SYSTEM SHALL abort without
  writing.
- **R-SEED-5 (Real addresses out of source)** — Real attendee email addresses
  SHALL be supplied at deploy time from configuration (a private file referenced
  by env), never committed to the repository (R-NFR-5).
- **R-SEED-6 (Consent is never pre-filled)** — Seeded production members SHALL
  start un-onboarded, so each member's own consent version and timestamp are
  recorded by their own acceptance (R-ONB-3, R-NFR-6).
- **R-SEED-7 (Idempotent)** — Re-running a seed SHALL upsert by natural key
  (trend number, case URL, member email) rather than duplicating rows.

---

## 11. Open questions

1. **Consent text** — who owns the legal/data-usage copy and its versioning?
2. **Admin UI depth** — is a minimal approvals list enough for beta, or is a
   fuller admin screen needed?
3. **Notifications** — are email notifications for incoming requests required at
   launch, or is in-app only acceptable for the summit (everyone is in the room)?
4. **Sending domain / deliverability** — which from-address does the SMTP server
   send as, and are SPF/DKIM/DMARC set up for it? This is the open part of the
   email question: the magic link must reach a phone inbox within ~30 s to hold
   the R-NFR-3 budget, and an unauthenticated from-address is the most likely way
   that fails (spam folder mid-break).
5. **Attribution of the collected challenges** — the ~15 real challenges were
   collected before the app existed. Are they seeded **attributed** to their
   authors (which means creating member rows and exposing their challenges for
   connection requests before those authors have accepted the consent in F2), or
   **unattributed** (visible as content, not connectable until the author logs in
   and claims them)? Unattributed is the safer default for the privacy model
   (R-NFR-1, R-ONB-3); attributed needs the authors' explicit OK first.

### Resolved

- **Email delivery provider** (2026-10-01) — the team has its **own SMTP server**
  available; no third-party transactional service (SendGrid/Postmark/SES) is
  needed for the beta. The app connects via nodemailer using `SMTP_*`
  environment configuration (R-NFR-5, design §1). Remaining sub-question: the
  sending domain, tracked as open question 4 above.
- **Seed data** (2026-10-01) — split by environment rather than chosen between:
  prototype fixtures for dev, real whitelist + collected challenges for
  production. See §10 (R-SEED-1..7) and `design.md` §6.
