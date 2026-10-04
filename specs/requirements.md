# Rebel Match — Requirements

Status: Draft for beta (summit launch 2026-11-08).
Audience: implementers building against a Node.js + Postgres stack (ADR 0024).

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

- Integration with the existing Corporate Rebels member platform. _(Meeting:
  "let's make that explicit — we're not aiming for integration in the corporate
  platform because that would be probably significant work.")_
- Gamification: standings, badges, ranks, milestone pop-ups. _(Meeting: "I would
  also focus on sharing experience and sharing problems and not the
  gamification.")_
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
- _(later)_ **`moderator`**, or anything else — added as a role with its own
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
- **R-ROLE-9 (Granting roles)** — A member holding `role:grant` SHALL be able to
  grant a role to an active member and revoke one, without a deploy or direct
  database access — so a host can be made an admin during the event.
  - Each grant records when and by whom (R-ROLE-7). Revoking removes the grant.
  - THE SYSTEM SHALL refuse a revocation that would leave no active member
    holding `role:grant`, so the system can never lock itself out. The check is
    on the permission, not on a role name (R-ROLE-3).
  - Only roles the permission policy knows can be granted.
- **R-ROLE-10 (Permission names)** — Permissions SHALL be named
  `resource:action` (`challenge:swipe`, `outbox:read`), so a name says what it
  guards.

---

## 3. Authentication & onboarding

### 3.1 Whitelist & access

- **R-AUTH-1** — The system SHALL restrict login to email addresses that are
  either on the **approved whitelist** (seeded from invited summit attendees) or
  are joining through a **valid invite link** (R-INV-1). No other address can
  obtain a session.
- **R-AUTH-2** — WHEN a non-whitelisted email requests access **without a valid
  invite** THE SYSTEM SHALL record it as a pending **applicant**, notify an admin,
  and show the **access-requested screen** (R-AUTH-9) — rather than granting
  access or showing the "check your email" state.
- **R-AUTH-3** — WHEN an admin approves an applicant THE SYSTEM SHALL move them
  to active, grant the `member` role, and immediately email them a working magic
  link (R-AUTH-10). WHEN an admin rejects an applicant THE SYSTEM SHALL prevent
  login and retain no challenge data for them.

### 3.2 Magic-link login

- **R-AUTH-4** — WHEN a user submits a whitelisted email on the login screen THE
  SYSTEM SHALL email them a single-use magic link and show a "check your email"
  state. _(Meeting: "something like a magic link that is then sent to your email…
  really simple user management.")_
  - A whitelisted address and an unknown one therefore lead to **different
    screens** (R-AUTH-2), which means the login screen reveals whether an address
    is known. This is a deliberate trade: telling an applicant the truth is worth
    more here than hiding membership of a 350-person invite list. See ADR 0013.
- **R-AUTH-5** — The magic link SHALL be single-use and SHALL expire (default 15
  minutes). **Opening the link SHALL NOT use it:** it SHALL show a sign-in
  screen, and WHEN the user confirms there with a deliberate action (a button,
  never a timer or a script) on a valid, unexpired, unused link THE SYSTEM SHALL
  create an authenticated session and consume the token. _(Chat apps fetch a
  link to build its preview, and corporate mail scanners open every link in a
  message; a link used by being opened would arrive spent. ADR 0027.)_
- **R-AUTH-6** — IF a user confirms an expired, used, or unknown link THEN THE
  SYSTEM SHALL show an error and offer to resend a new link.
- **R-AUTH-7** — The system SHALL keep the user signed in via a session that
  survives closing and reopening the browser (so a phone user mid-break is not
  logged out), until they explicitly log out **or have been inactive for the
  configured idle period** (default 30 days, R-CFG-1). Every use of the app
  restarts that period, so a member who keeps using it is never signed out by
  it.
- **R-AUTH-8** — The system SHALL NOT require a password at any point.
- **R-AUTH-9 (Access-requested screen)** — The access-requested state SHALL be
  its own screen at its own URL, not a variant of the "check your email" state.
  It SHALL tell the applicant, in plain language: that their interest is
  welcome, that access is approved by a person, that **they will be notified by
  email once approved**, and that the email will contain a working login link —
  so nobody waits on a second step they do not know about.
- **R-AUTH-10 (Approval sends a link, not a notice)** — WHEN an admin approves an
  applicant THE SYSTEM SHALL send a magic link in the approval email itself. THE
  SYSTEM SHALL NOT send a "you have been approved, now go and request a link"
  message: at an event, a round trip the member has to start again costs the
  minutes R-NFR-3 exists to protect.
  - Approval links are issued without the member asking, so they SHALL have
    their own, longer lifetime (default **24 hours**, from config), independent
    of the 15-minute self-service link (R-AUTH-5, R-CFG-1).
  - An expired approval link SHALL fall back to the normal resend path
    (R-AUTH-6), never to a dead end.
- **R-AUTH-11 (The host can find them)** — The admin notification and the pending
  applicant list SHALL carry what a host needs to recognize someone in the room:
  the email address, the time of the request, and any name or organization the
  applicant supplied. This is what lets the host of an event check in with the
  people who cannot get in yet, and approve them on the spot.
- **R-AUTH-12** — The access-requested screen MAY invite the applicant to add a
  **name and organization** (both optional), for no purpose other than R-AUTH-11.
  It SHALL NOT block or delay the request, which is already recorded. These are
  applicant-supplied fields, stored separately from profile data, and they SHALL
  NOT count towards onboarding completion (R-ONB-1). Onboarding MAY pre-fill its
  name field from them — every second counts (R-NFR-3).
- **R-AUTH-13 (Tell a rejected applicant)** — IF an address whose request was
  rejected asks for a link again THEN THE SYSTEM SHALL tell them plainly that
  their request was not approved — send no link, notify nobody, and not promise
  an email that will never come (ADR 0013). Re-admitting them stays a deliberate
  admin action (R-AUTH-3).

### 3.3 First-time onboarding

- **R-ONB-1** — WHEN an authenticated member has **not completed onboarding** THE
  SYSTEM SHALL present the first-time onboarding screen before any other screen.
  Onboarding is complete only when a display name **and** an acceptance of the
  current consent version are both recorded — a name alone SHALL NOT satisfy it
  (R-ONB-4, R-NFR-6).
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
  the app is **closed: membership is by invitation**, whether from the whitelist
  or an event invite link (R-INV-1). _(Meeting: "we need to make it very explicit
  that the emails will be shared when you connect.")_

---

### 3.4 Invite links (QR auto-approval)

At a summit the admin queue is the wrong shape: a host cannot approve people one
by one during a ten-minute break. An invite link carries a token in the QR code
and admits the scanner straight away, so R-NFR-3's two minutes apply to someone
who was never on the whitelist.

The token is printed on a badge, a slide, or a poster. It is therefore **a public
capability, not a secret** — and every requirement below exists because of that.

- **R-INV-1 (Auto-approval)** — The system SHALL support **invite links**: a token
  carried in the QR URL. WHEN a non-whitelisted email requests a link WHILE a
  valid invite token is present THE SYSTEM SHALL create the member as active,
  grant the `member` role, and email a magic link immediately — skipping the
  applicant queue (R-AUTH-2) and the admin approval step entirely.
- **R-INV-2 (Time-scoped)** — Every invite SHALL carry a validity window (a start
  and an end). Outside that window the token SHALL be inert.
- **R-INV-3 (Revocable)** — An admin SHALL be able to revoke an invite in a single
  action, and revocation SHALL take effect on the **next use** — never from a
  cache. A printed QR code cannot be recalled, so revocation is the only way to
  close a link that has escaped.
- **R-INV-4 (Capped)** — Every invite SHALL carry a **maximum number of uses**,
  defaulted sensibly and settable by the admin. At the cap the token SHALL be
  inert. A link that leaks must not be able to admit an unbounded crowd.
- **R-INV-5 (Graceful fallback)** — IF a token is unknown, not yet valid, expired,
  revoked, or at its cap THEN THE SYSTEM SHALL continue into the ordinary
  applicant flow (R-AUTH-2) and present the **access-requested screen**
  (R-AUTH-9) with a **notice that the invitation link is not valid**. It SHALL NOT
  show an error dead end: the person is standing in the room holding a phone, and
  the QR cannot be reprinted.
  - The notice SHALL be **state-agnostic** — "this invitation link isn't valid
    right now" — because the next step is identical whether the link expired, was
    revoked, has not started yet, or is full. It SHALL NOT name which control
    refused it, and SHALL NOT imply the person did something wrong.
  - The notice SHALL NOT replace or obscure the screen's primary message: that
    their request is recorded, a person approves it, and the approval email
    carries their login link (R-AUTH-9).
  - The notice SHALL be part of the screen's URL state, so a reload keeps it
    (R-NAV-1), and SHALL NOT carry the token (R-INV-12).
  - The notice SHALL be announced to assistive technology, not conveyed by colour
    alone (R-NFR-2).
  - The refusal SHALL NOT be sent to analytics: the visitor has not onboarded,
    so cannot have opted in (R-ANA-4, ADR 0026). A host sees a failing invite as
    applicants arriving on the approvals screen instead of joining.
- **R-INV-6 (Consent is not skipped)** — Auto-approval SHALL skip **admin
  approval only**. The member SHALL still complete onboarding, including explicit
  acceptance of the current consent version (R-ONB-1, R-ONB-3).
- **R-INV-7 (Member role only)** — An invite SHALL grant the `member` role and
  nothing else. No invite can confer admin or any other role (R-ROLE-3).
- **R-INV-8 (Audit)** — THE SYSTEM SHALL record, per member admitted this way,
  **which invite** admitted them, and per invite, **which admin** created it and
  when. A bad batch must be identifiable after the fact, and removable (R-NFR-7).
- **R-INV-9 (Admin screen)** — The admin interface SHALL include an **invite
  screen** of its own that lists every invite with its label, window, uses against
  cap, and state (active / scheduled / expired / revoked / exhausted), and allows
  creating and revoking. Each invite SHALL show its join URL so the host can
  render or re-render the QR code; it MAY render the QR itself.
- **R-INV-10 (Labelled)** — Every invite SHALL carry a human label (for example
  "Summit 2026 — main stage"), because a host with three posters needs to know
  which token to revoke.
- **R-INV-11 (Rate limiting still applies)** — The presence of a valid invite SHALL
  NOT relax rate limiting on link requests (R-NFR-5).
- **R-INV-12 (Recognition)** — The login screen MAY confirm that an invite was
  recognized (for example "joining via Summit 2026"), so a scanner knows the QR

  worked before they type anything. It SHALL NOT reveal the token itself.

### 3.5 Profile, privacy and the menu

- **R-PROF-1** — An onboarded member SHALL be able to edit their **display name**
  (required), **job title** and **organization** after onboarding, within the
  same limits as onboarding (R-ONB-2, R-CFG-2). The email address is how they
  sign in and SHALL NOT be editable here.
  - Every setting on the profile screen SHALL **save on change**, with no save
    button, and SHALL confirm each save beside the field with a small, quiet
    mark (a tick), announced to assistive technology (R-NFR-2). A field left
    invalid, such as an empty name, SHALL NOT save and SHALL say why; a failed
    save SHALL say so and keep what the member typed.
- **R-PROF-2** — The profile screen SHALL show the data-usage consent the member
  accepted, read-only, with its version and the time they accepted it (R-NFR-6),
  and SHALL carry the **analytics opt-in**, given or withdrawn there (R-ANA-4).
  It SHALL say how to leave: by emailing the host, who erases the account
  (R-NFR-7). Self-service deletion stays post-beta (C4).
- **R-PROF-3** — The header SHALL carry a **menu** in place of the "CR" mark,
  offering: the colour mode switch (R-LOOK-2), the profile screen, the host tools
  the member's permissions allow (R-ROLE-4), and sign out. The menu holds links
  and one switch only, so it is navigation, not a screen (R-NAV-1); every item it
  leads to has its own URL.

---

## 4. Ask for help (challenge author journey)

### 4.1 Submit a challenge

- **R-ASK-1** — The system SHALL let a member write **one challenge in free
  text**, in their own words, with guidance prompts (what they observe, what they
  want to change, where they struggle).
- **R-ASK-2** — The system SHALL show example challenges as **inspiration only**:
  short, read-only hints of the kind of thing that belongs here. THE SYSTEM SHALL
  NOT offer to insert or prefill an example into the member's text, so members
  describe their own situation instead of submitting boilerplate. _(Rationale: a
  one-tap "use this example" invites a deck full of identical stock challenges,
  which would make matching meaningless.)_
- **R-ASK-3** — WHILE the challenge text is **30 characters or shorter** THE
  SYSTEM SHALL keep the submit/analyze action disabled, so the matcher has enough
  words to work with. The screen SHALL show a character counter.
- **R-ASK-4** — WHEN the member submits THE SYSTEM SHALL persist the challenge and
  proceed to trend categorization.

### 4.2 Trend categorization

- **R-ASK-5** — WHEN a challenge is submitted THE SYSTEM SHALL auto-assign it to
  exactly one of the **8 Corporate Rebels trends** using keyword detection (see
  `design.md` §matching). _(Meeting: Andy — "It works really nice… good enough for
  the beta." Keep it, start simple.)_
- **R-ASK-6** — The system SHALL show the assigned trend, what it moves _from_
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
  hidden **"Trend 0 — Trust"** card: _from Rules → to Trust · peers: everyone in
  the room_, with a line crediting the Corporate Rebels bucket list. Rules:
  - It is cosmetic only. Swiping it SHALL NOT create a swipe record, a connection
    request, or a follow, and SHALL NOT be reachable from the normal deck.
  - It SHALL be dismissible, SHALL NOT block the "submit your own challenge"
    call to action, and SHALL be reachable by keyboard and announced to screen
    readers like any other card (R-NFR-2).
  - It MAY emit a single non-identifying analytics event (`easter_egg_found`) and
    nothing else (R-ANA-3).

---

## 6. Connecting — double opt-in (privacy-critical)

This replaces the prototype's direct `mailto:`. _(Meeting, Ivo: "probably this is
needed, not optional — that first the app asks the other person, hey do you want
to get in touch with this person, and then you send an email." Andy: "if we do
that we need to make it very explicit that the emails will be shared when you
connect.")_

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
- **R-ANA-4** — Analytics SHALL be **opt-in** (ADR 0026): onboarding SHALL
  offer a separate, unticked choice with its own versioned words, apart from
  the data-usage consent (§3.3). Ticking it SHALL record the analytics consent
  version and time; the member SHALL be able to withdraw or give it later in
  the app as easily as at onboarding. THE SYSTEM SHALL capture events only for
  a member opted in at that moment, and never for a visitor who has not
  onboarded. The opt-in lives on the profile screen (R-PROF-2).
- **R-ANA-5** — The chosen tool SHALL have a usable free tier at summit scale
  (hundreds of users, thousands of events) and SHALL store event data in the EU.
  _(Resolved: Mixpanel offers EU data residency on the free plan at no extra
  cost — see `design.md` §7.)_

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

  | URL                                  | Screen                                         |
  | ------------------------------------ | ---------------------------------------------- |
  | `/`, `/?invite=…`                    | entry: routes to login, onboarding, or welcome |
  | `/login`                             | login / "check your email"                     |
  | `/access-requested`                  | applicant: what happens next (R-AUTH-9)        |
  | `/access-requested?invite=invalid`   | same, with the invalid-invite notice (R-INV-5) |
  | `/auth/verify?token=…`               | magic-link landing                             |
  | `/onboarding`                        | name + consent                                 |
  | `/welcome`                           | two doors                                      |
  | `/ask`                               | submit a challenge                             |
  | `/challenges/:id`                    | detected trend for that challenge              |
  | `/challenges/:id/trend`              | trend picker                                   |
  | `/challenges/:id/matches`            | same boat / been there / cases                 |
  | `/challenges/:cid/connect/:memberId` | connection request                             |
  | `/trends/:trendId`                   | trend detail + case studies                    |
  | `/offer`                             | swipe deck                                     |
  | `/offer/:challengeId/note`           | write a "been there" note                      |
  | `/offer/done`                        | empty deck / session summary                   |
  | `/matches`                           | cockpit                                        |
  | `/matches/requests/:id`              | one request (pending, or accept/decline)       |
  | `/matches/requests/:id/contact`      | contact detail, accepted requests only         |
  | `/profile`                           | profile & privacy (R-PROF-1,2)                 |
  | `/admin/applicants`                  | admin approvals                                |
  | `/admin/invites`                     | invite links (R-INV-9)                         |
  | `/admin/members`                     | members, with GDPR erasure (R-NFR-7)           |
  | `/admin/outbox`                      | dev outbox (dev deployments only)              |

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
- **R-NAV-10** — The summit QR code SHALL point at the app root, optionally with a
  non-identifying campaign parameter for analytics and an **invite token**
  (R-INV-1), and follow the same routing. The invite token SHALL survive the trip
  to the login screen.

---

## 8c. Outbound message log and development deployment

Every message the system sends is recorded, in **every** environment. Outbound
email is otherwise a black box: there is no other place to look, and the first
question at a summit will be "did it actually go out?".

What differs by environment is only whether mail **leaves the machine**.

- **R-MSG-1 (Record everything, everywhere)** — WHEN the system sends or attempts
  to send a message THE SYSTEM SHALL record it in an **outbound message log**,
  regardless of environment. The record SHALL carry the recipient address, the
  message type (magic link, approval, connection request, admin notice), the
  subject, the status, and the times it was recorded and sent.
- **R-MSG-2 (Record before sending)** — THE SYSTEM SHALL write the record
  **before** handing the message to the transport, then update its status. A
  crash mid-send therefore leaves evidence that the attempt happened, rather than
  a silent gap.
- **R-MSG-3 (Statuses distinguish why nothing arrived)** — Status SHALL be one of:
  `recorded` (written, not yet attempted), `sent` (the transport accepted it),
  `suppressed` (deliberately not sent, because delivery is off — R-DEV-1), or
  `failed` (the transport refused it, with the error retained). "We chose not to
  send" and "we tried and could not" SHALL NOT look the same.
- **R-MSG-4 (A log is not a key cupboard)** — Outside a development deployment THE
  SYSTEM SHALL NOT store a usable credential in the log: a magic-link token SHALL
  be redacted from the stored body before it is written. An admin can see **that**
  a link was sent, to whom, and when — never the link itself. _(Without this, the
  log is a route to signing in as any member, and `outbox:read` quietly becomes
  the most powerful permission in the system.)_
- **R-MSG-5 (Admin visibility)** — The admin interface SHALL present the log,
  newest first, with recipient, type, subject, status, timestamps and any error,
  filterable by recipient and status. It SHALL be guarded by a permission
  (`outbox:read`), never by environment.
- **R-MSG-6 (It holds personal data)** — Log entries contain email addresses and
  message content, so they SHALL be included in erasure (R-NFR-7) and SHALL be
  retained for a bounded, configurable period rather than forever.
- **R-MSG-7 (Delivery failures are visible without reading bodies)** — A `failed`
  entry SHALL retain enough of the transport's error to diagnose a deliverability
  problem (R-NFR-3), and that error SHALL NOT contain the credential.

### Development deployment

- **Development deployment** means `NODE_ENV=development` **and**
  `MAIL_DELIVERY=none`: a server from which mail cannot leave, holding only
  fictional people. It is the only environment R-DEV-1 exempts from R-MSG-4. It
  may be a developer's machine or a deployed server — the pull-request previews
  and staging are development deployments (ADR 0025). What decides it is the
  data, not where it runs: production, CI (`NODE_ENV=test`), and a developer's
  machine pointed at a real SMTP server to test deliverability are not
  development deployments, so they redact. R-SEED-8 keeps real people out of
  one.
- **R-DEV-1** — WHILE running as a development deployment THE SYSTEM SHALL NOT
  send outbound email. Messages SHALL still be recorded (R-MSG-1) with status
  `suppressed`, and in this environment **only**, the stored body SHALL keep the
  magic link intact and clickable — so a developer can sign in as any seeded
  member without a mailbox, while nothing can reach a real person.
- **R-DEV-2** — _(Superseded by R-MSG-5.)_ The outbox screen is a permanent admin
  feature, not a development affordance.
- **R-DEV-3** — _(Superseded by R-MSG-4.)_ The log exists in every environment;
  what production withholds is the credential, not the screen.
- **R-DEV-4** — Whether mail is delivered SHALL be configuration, not a code
  change, so the same build runs in both environments.
- **R-DEV-5** — Production SHALL refuse to start with delivery switched off. A
  deployment that records magic links and sends none is one where nobody can log
  in, and it SHALL fail loudly at startup rather than quietly at the first scan.
- **R-DEV-6 (The first sign-in)** — The outbound message log needs `outbox:read`,
  so it cannot be how a developer signs in the first time. WHILE running as a
  development deployment with delivery off and the `dev` seed, `npm run dev`
  SHALL print a fresh magic link for the seeded dev admin
  (`admin@rebel-match.invalid`), and `npm run dev:login <email>` one for any
  seeded member.
  - The link SHALL be issued through the auth seam (ADR 0015) and recorded in the
    log like any other (R-MSG-1); it is single-use and expires (R-AUTH-5). No
    pre-made session SHALL exist.
  - The output SHALL name the member's role, never an email address or name
    (constitution §5).
  - Outside those three conditions both commands SHALL refuse, saying why.

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

## 8f. Look and colour modes

The beta wears the prototype's look, and keeps its "CR" happy mode as an
optional extra: it costs one set of colour tokens and changes nothing else.
_(Decided by the maintainer after trying the redesign: ADR 0023.)_

- **R-LOOK-1 (Prototype look)** — The client SHALL follow the prototype's design
  language (`specs/prototype/`): Anton headlines, Archivo text, JetBrains Mono
  labels, cream paper, near-black ink and an ember accent. Fonts SHALL be served
  by the app itself, never from a third-party font host, so no visitor's address
  reaches one.
- **R-LOOK-2 (Happy mode)** — The header menu (R-PROF-3) SHALL offer a switch
  between the calm default and happy mode, announced as a switch to assistive
  technology. _(It replaces the prototype's "CR" button.)_ The choice SHALL be remembered per browser and SHALL
  change colours and decoration only, never content, behaviour or anything
  recorded. IF the browser refuses storage THEN the app SHALL still switch, and
  start calm next time.
- **R-LOOK-3 (Modes are tokens)** — Colour modes SHALL be sets of colour tokens
  over one set of components, so a further mode (a dark mode, priorities C7) is a
  new token set rather than new screens. Every mode SHALL keep text readable
  against its background.

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
  scratch against a disposable Postgres service, so a broken migration is caught
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
  - This applies both to a **whitelisted** attendee and to someone arriving
    through an **invite link** (R-INV-1) — auto-approval exists precisely so the
    second case fits the same budget. It does not apply when a human has to
    approve (R-AUTH-2), which is outside our control.
- **R-NFR-4 (Capacity)** — The beta SHALL comfortably handle the summit cohort:
  up to ~350 members and a few hundred challenges/connection requests. No
  horizontal scaling required.
- **R-NFR-5 (Data protection)** — Magic-link tokens SHALL be stored hashed, never
  in plaintext. Sessions SHALL use signed, http-only cookies. Secrets (SMTP,
  session key, DB credentials) SHALL come from environment configuration, not
  source. The one exception is a local run on PGlite (no `DATABASE_URL`), which
  MAY generate its own session key and keep it in its git-ignored data folder;
  a production start without both values SHALL be refused (ADR 0024).
- **R-NFR-6 (Auditability of consent)** — The system SHALL retain, per member,
  the consent version and acceptance timestamp.
- **R-NFR-7 (Deletion)** — The system SHALL support deleting a member and the
  personal data attached to them — challenges, connection requests, swipes,
  follows, role grants, and their **outbound message log entries** (R-MSG-6) — on
  request (GDPR erasure), at minimum via an admin action.

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
  challenges** with their trend assignments. _(Meeting: "around 15 or so" real
  challenges already came in.)_
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
- **R-SEED-8 (No real people in a development deployment)** — IF the seed runner
  is invoked with the prod profile WHILE running as a development deployment
  THEN THE SYSTEM SHALL abort without writing. A development deployment keeps
  magic links readable in its log (R-DEV-1); real addresses there would make
  the log a way into real people's accounts.

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
   that fails (spam folder mid-break). The runbook is `docs/email-setup.md`.
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
