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

- **R-AUTH-1** — The system SHALL restrict use of the app to email addresses
  that are on the **approved whitelist** (seeded from invited summit
  attendees), are joining through a **valid invite link** (R-INV-1), or were
  approved by a host (R-AUTH-3). Any other address MAY sign in to confirm it,
  but SHALL reach only onboarding and the waiting screen (R-AUTH-9, ADR 0043).
- **R-AUTH-2** — WHEN a non-whitelisted email requests access **without a valid
  invite** THE SYSTEM SHALL record it as a pending **applicant**, email it a
  sign-in link like any other address (R-AUTH-4), and notify the members who
  review applicants (R-NOTE-1). The applicant need not use that link to be
  approved; the approval email carries one (R-AUTH-10, ADR 0043).
- **R-AUTH-3** — WHEN an admin approves an applicant THE SYSTEM SHALL move them
  to active, grant the `member` role, and immediately email them a working magic
  link (R-AUTH-10). WHEN an admin rejects an applicant THE SYSTEM SHALL prevent
  login, end their sessions and retain no challenge data for them, nor their
  profile draft (R-ONB-15).

### 3.2 Magic-link login

- **R-AUTH-4** — WHEN a user submits an email on the login screen that has not
  been rejected (R-AUTH-13) THE SYSTEM SHALL email them a single-use magic link
  and show the **check-your-email screen**: it says the link is on its way and,
  for the wait, offers the profile form (R-ONB-7). The link works whether or
  not the form is filled. _(Meeting: "something like a magic link that is then
  sent to your email… really simple user management.")_
  - For an applicant the screen SHALL also say that **access is approved by a
    person** and that they will be emailed once they are in. A whitelisted
    address and an unknown one therefore still lead to different words, which
    means the login screen reveals whether an address is known. This is a
    deliberate trade: telling an applicant the truth is worth more here than
    hiding membership of a 350-person invite list. See ADR 0013.
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
- **R-AUTH-9 (Access-requested screen)** — WHILE a signed-in applicant who has
  completed onboarding waits for approval THE SYSTEM SHALL show the
  access-requested screen, at its own URL, instead of the app (R-AUTH-4 tells
  those who have not signed in). It SHALL tell
  them, in plain language: that their interest is welcome, that access is
  approved by a person, that **they will be notified by email once approved**,
  and that the email will contain a working login link — so nobody waits on a
  second step they do not know about.
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
  the email address, the time of the request, **whether the address is
  confirmed yet** (by signing in), and the name and organization from their
  profile draft or profile, if given (R-ONB-15). This is what lets
  the host of an event check in with the people who cannot get in yet, and
  approve them on the spot.
- **R-AUTH-12** — _(Withdrawn: the profile draft (R-ONB-15) replaces the name
  and organization an applicant could add to their request. ADR 0043.)_
- **R-AUTH-13 (Tell a rejected applicant)** — IF an address whose request was
  rejected asks for a link again THEN THE SYSTEM SHALL tell them plainly that
  their request was not approved — send no link, notify nobody, and not promise
  an email that will never come (ADR 0013). Re-admitting them stays a deliberate
  admin action (R-AUTH-3).

### 3.3 First-time onboarding

- **R-ONB-1** — WHEN an authenticated member has **not completed onboarding** THE
  SYSTEM SHALL present first-time onboarding (R-ONB-6) before any other screen.
  Onboarding is complete only when a display name **and** an acceptance of the
  current consent version are both recorded — a name alone SHALL NOT satisfy it
  (R-ONB-4, R-NFR-6).
- **R-ONB-2** — The profile step of onboarding SHALL collect the **display name**
  (required) and MAY collect **job title**, organization, **sector** and
  **company size** (optional, used in match cards). Sector and company size are
  each picked from a fixed list, never typed: sector from the list in design §2,
  company size from at most five headcount bands, shown on cards as "_n_
  employees". "Job title" is profile text and is unrelated to access roles
  (R-ROLE-8).
- **R-ONB-3** — The privacy step of onboarding SHALL present the **data-usage
  consent** as a short summary and SHALL require the member to confirm having
  read it and the terms of use (R-ONB-13), with one button labelled "I have
  read the privacy notice and the terms of use", before
  continuing. THE SYSTEM SHALL record the consent version and timestamp
  (ADR 0041).
- **R-ONB-4** — IF the user has not accepted the current consent version THEN THE
  SYSTEM SHALL block access to the main app and re-present the consent.
- **R-ONB-5** — The consent copy SHALL state plainly that **email addresses are
  shared with another member only when both sides accept a connection**, and that
  the app is **closed: membership is by invitation**, whether from the whitelist
  or an event invite link (R-INV-1). It SHALL also say that the member's
  **name, organization and other profile information may be seen by other
  members** — wherever the app shows them, not only on match cards — while the
  email address stays private until a connection is accepted. It SHALL name
  **who is responsible** for the data and how to reach them, and SHALL say that
  the member can ask for a copy or a correction, and can delete their activity
  history or their account themselves on the profile screen (R-PROF-2), with
  the rest in the full privacy notice (R-ONB-9, ADR 0041).
  _(Meeting: "we need to make it very explicit
  that the emails will be shared when you connect.")_
- **R-ONB-6 (Three steps)** — Onboarding SHALL run as three screens in this
  order, each with its own URL (R-NAV-4): **profile** (R-ONB-2), **privacy**
  (R-ONB-3) and **usage data** (R-ANA-4). Each SHALL show the step header of
  the Ask journey, labelled Profile, Privacy and Usage (R-LOOK-4). WHEN the
  member's profile draft already holds a name THE SYSTEM SHALL start at the
  privacy step (R-ONB-15). _(Decided by the maintainer: ADR 0041, ADR 0043.)_
- **R-ONB-7 (Notice where it is collected)** — The profile form, on the
  check-your-email screen (R-AUTH-4) and on the profile step, SHALL save each
  field on change to the member's profile draft (R-ONB-15), with the tick of
  R-PROF-1, and SHALL say: "We keep what you enter here to set up your
  account.", followed by links to the privacy notice (R-ONB-9) and the terms of
  use (R-ONB-13). Entering data there SHALL NOT count as accepting either
  (R-ONB-3).
- **R-ONB-8 (One confirmation)** — WHEN the member confirms on the privacy step
  THE SYSTEM SHALL make the draft their profile and record the consent version
  and time, in one request; onboarding is then complete (R-ONB-1). The privacy
  step SHALL say, below the button: "Other members see your profile once you
  tap this button.", or, to a pending applicant, "Other members see your
  profile once a host has let you in." (R-AUTH-1).
- **R-ONB-9 (Full privacy notice)** — The system SHALL serve the full privacy
  notice as a screen of its own, readable without signing in and showing its
  version and date. It SHALL be linked from the profile step, the privacy step
  and the profile screen (R-PROF-2). _(Its words are drafted in
  `docs/legal/privacy-notice.md`.)_
- **R-ONB-10 (Scroll hint)** — WHILE the confirm button of the privacy step is
  outside the visible area THE SYSTEM SHALL show a floating button that scrolls
  the summary down by part of the visible height, never to its end. The hint
  SHALL disappear once the confirm button is visible, and the confirm button
  SHALL work whether or not the member scrolled.
- **R-ONB-11 (After the privacy step)** — WHEN the member has confirmed on the
  privacy step THE SYSTEM SHALL show the usage-data step, unless they are
  already opted in to the current analytics words. That step SHALL say that
  the profile is saved and where to edit it (R-PROF-1), and either answer
  there SHALL continue to the screen the member came for (R-NAV-7).
- **R-ONB-12 (Going back)** — The onboarding steps SHALL carry no back control
  of their own. WHEN the member goes back from the privacy step with the
  browser THE SYSTEM SHALL show the profile step with what they typed.
- **R-ONB-13 (Terms of use)** — The system SHALL serve the terms of use as a
  screen of its own, readable without signing in and showing its version and
  date. The privacy step SHALL link to it beside the link to the privacy
  notice, and its button confirms having read both (R-ONB-3); the privacy
  notice and the profile screen SHALL link to it
  too. A change of the terms SHALL be a new consent version (R-ONB-4).
  _(Its words are drafted in `docs/legal/terms-of-use.md`.)_

- **R-ONB-14 (Profile preview)** — The privacy step SHALL show a **profile
  preview**: the member's card as other members see it, drawn by the same
  component (R-LOOK-4), with an **Edit** button that opens the profile step
  with the draft. Nobody confirms a profile they have not seen, including one
  somebody else typed for their address (ADR 0043).
- **R-ONB-15 (Profile draft)** — What is entered on the profile form SHALL be
  kept as a **draft**, apart from the profile: never shown to other members,
  except its name and organization to the hosts reviewing an applicant
  (R-AUTH-11), and never counted towards onboarding (R-ONB-1). Before sign-in only the
  check-your-email screen of a sign-in request may write it, with a token
  issued with that request, stored hashed, and spent when the draft is
  confirmed or deleted; a later request SHALL NOT spend an earlier one. A draft SHALL be deleted once confirmed
  (R-ONB-8), with the account (R-NFR-7), and otherwise after
  `limits.profileDraftRetentionDays` (default 30, R-CFG-1).

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
  - An admin SHALL be able to **raise** the cap of an invite that is not
    revoked, from the invite screen, so a printed code keeps admitting once it
    fills up. The new cap SHALL be higher than the current one and within the
    ceiling; a cap is never lowered.
- **R-INV-5 (Graceful fallback)** — IF a token is unknown, not yet valid, expired,
  revoked, or at its cap THEN THE SYSTEM SHALL continue into the ordinary
  applicant flow (R-AUTH-2) and present the **check-your-email screen**
  (R-AUTH-4) with a **notice that the invitation link is not valid**, above
  its applicant message that a person approves access. It SHALL NOT
  show an error dead end: the person is standing in the room holding a phone, and
  the QR cannot be reprinted.
  - The notice SHALL be **state-agnostic** — "this invitation link isn't valid
    right now" — because the next step is identical whether the link expired, was
    revoked, has not started yet, or is full. It SHALL NOT name which control
    refused it, and SHALL NOT imply the person did something wrong.
  - The notice SHALL NOT replace or obscure the screen's primary message: that
    their sign-in link is on its way, and that a person approves access
    (R-AUTH-4).
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
  cap, opens (R-STAT-6), and state (active / scheduled / expired / revoked / exhausted), and allows
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
  (required), **job title**, **organization**, **sector** and **company size**
  after onboarding, within the same limits and lists as onboarding (R-ONB-2,
  R-CFG-2). The email address is how they
  sign in and SHALL NOT be editable here.
  - Every setting on the profile screen SHALL **save on change**, with no save
    button, and SHALL confirm each save beside the field with a small, quiet
    mark (a tick), announced to assistive technology (R-NFR-2). A field left
    invalid, such as an empty name, SHALL NOT save and SHALL say why; a failed
    save SHALL say so and keep what the member typed.
- **R-PROF-2** — The profile screen SHALL show the data-usage consent the member
  accepted, read-only, with its version and the time they accepted it (R-NFR-6)
  and a link to the full privacy notice (R-ONB-9),
  and SHALL carry the **analytics opt-in**, given or withdrawn there (R-ANA-4),
  and the choice of how each notification arrives (R-NOTE-3).
  It SHALL offer **deleting one's activity history** (R-STAT-4) and
  **deleting one's own account** (C4): after one confirmation
  that says what goes, when, and how to change one's mind, the account is
  deactivated and the member signed out; everything R-NFR-7 lists is erased
  after the grace period unless they keep the account (ADR 0032). Deletion SHALL be
  refused, saying why and what to do, while the member is the last who can grant
  roles (R-ROLE-9) or invite links they created remain.
- **R-MEM-1 (Member cards)** — The host tools' members list SHALL show each
  member as a card with the same lines the app shows a person by elsewhere —
  the name, then job title · organization · sector, leaving out what they did
  not give — and below them the email, roles and status. Search by email or
  name stays.
- **R-MEM-2 (A member's page)** — Tapping a card SHALL open that member's own
  page in the host tools, at its own URL, showing everything held about them:
  name, job title, organization, sector, email, status, roles, when and through
  which invite they joined, the consent version they accepted and when, the
  analytics opt-in, and how many challenges and connection requests they have.
  It SHALL leave out the member's 9toRevolution results, which no host sees
  (R-GAME-15). From there a host SHALL be able to change their roles (R-ROLE-9)
  and delete them (R-NFR-7), each within the host's own permissions; later
  member actions belong on this page. For a deleted account it SHALL show when
  it will be erased, and offer to restore it or erase it at once (ADR 0032).
- **R-MEM-3 (Selecting several)** — Each card SHALL carry a small **selector**
  that shows whether it is selected; tapping it, or holding the card, SHALL
  start selecting with that card chosen, and while selecting each tap selects
  or deselects a card. A selected card SHALL show it in its outline as well as
  its selector, so it is plain which are chosen. Actions SHALL apply to every
  selected member: give a role,
  take a role away, and delete after one confirmation that says how many. Each
  member's outcome SHALL be reported, and one refused (the last admin, say)
  SHALL NOT stop the rest.
- **R-PROF-3** — The header SHALL carry a **menu** in place of the "CR" mark,
  offering: the colour mode switch (R-LOOK-2), the member's notifications
  (R-NOTE-5, R-NOTE-6), the profile screen, feedback (R-FB-1), the host tools
  the member's permissions allow (R-ROLE-4), the impressum (R-PROF-4), and
  sign out, with the running version at its foot (R-NFR-11). The menu holds links and one switch only, so it is
  navigation, not a screen (R-NAV-1); every item it leads to has its own URL.
- **R-PROF-4 (Impressum)** — The menu SHALL offer an **Impressum** to everyone,
  signed in or not, that shows the people who made the app one card at a time,
  each with their portrait, name and what they are responsible for, browsed as
  the swipe deck is (R-OFF-1, R-LOOK-4), and closes with a card for the
  community. It is public and has its own URL (R-NAV-1). In happy mode, for a
  member who completed onboarding and while the game is on, the community's
  card is the door to 9toRevolution (R-GAME-1).

---

## 4. Ask for help (challenge author journey)

### 4.1 Submit a challenge

- **R-ASK-1** — The system SHALL let a member write **one challenge in free
  text**, in their own words, with guidance prompts (what they observe, what they
  want to change, where they struggle).
- **R-ASK-2** — The system SHALL show, under the heading **Inspiration**, the
  newest challenges other members have posted (R-ASK-14), as **inspiration
  only**: read-only, the text and its trend, never who wrote it. THE SYSTEM
  SHALL NOT offer to insert or prefill one into the member's text, so members
  describe their own situation instead of submitting boilerplate; IF there are
  none yet the section SHALL NOT show. No invented example stands in for them.
  _(Rationale: a one-tap "use this example" invites a deck full of identical
  stock challenges, which would make matching meaningless.)_
- **R-ASK-3** — WHILE the challenge text is **30 characters or shorter**, or
  **longer than 500 characters**, THE SYSTEM SHALL keep the submit/analyze
  action disabled: the matcher needs enough words to work with, and a peer
  needs to read the challenge on one phone screen, on the deck card and in the
  connection request. The screen SHALL show a character counter with both
  limits, and the field SHALL NOT take more than the maximum.
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
  notified of future challenges in it (R-NOTE-1).
- **R-ASK-10** — Each "same boat" and "been there" peer card SHALL expose a
  **Connect** action governed by the double opt-in flow (§6), not a direct email.
- **R-ASK-11 (Posting is confirmed)** — WHEN the member confirms the trend THE
  SYSTEM SHALL open the matches view with a success banner saying the challenge
  is live and that members who can help will now see it. The banner SHALL show
  only on that arrival, not when the member returns to the view later.
- **R-ASK-12 (Purpose in every word)** — The matches view SHALL name its
  sections by the people in them and what to do with them: _Rebels facing this
  now — connect and compare notes_, _Rebels who've been there — ask how they
  solved it_, _Rebel organizations that did it — read how they made the shift_.
  The "Same boat" and "Been there" labels stay as tags elsewhere (deck, cockpit).
- **R-ASK-13 (No dead end)** — IF a peer section is empty THE SYSTEM SHALL say
  that other members will find the challenge, not merely that nobody is there;
  and IF both peer sections are empty THE SYSTEM SHALL offer a way on to the
  Offer help deck. It SHALL NOT promise a notification the system does not
  send.
- **R-ASK-14 (Newest challenges)** — The trend screen SHALL show the newest
  challenges other members have in that trend, and IF there are none SHALL say
  so. Here and in R-ASK-2, newest challenges are at most
  `limits.newestChallengesShown`, newest first, each shown as its text and
  trend, as the connection request shows the challenge it is about, never who
  wrote it. Only an active challenge of an active, onboarded member counts, as
  for the deck (R-OFF-1), and never the viewer's own.

---

## 5. Offer help (swipe journey)

- **R-OFF-1** — The system SHALL present other members' challenges as a swipeable
  deck (one card at a time, swipe or arrow navigation), excluding the viewer's
  own challenges.
- **R-OFF-2** — Each card SHALL show the challenge text, its trend, author, and
  organization, sector and company size, leaving out what the author did not
  give.
- **R-OFF-3** — For each card the member SHALL be able to:
  - **Same boat** — "I'm facing this too" (a same-boat connection request).
  - **Been there** — "I can share experience" (an offer-help connection request,
    with an optional note).
  - **Follow this topic** — follow the card's trend. WHILE the member already
    follows the card's trend THE SYSTEM SHALL say so on the action and keep it
    disabled.
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
- **R-OFF-7 (Opened at a card)** — WHEN the deck is opened at a challenge
  (`/offer?challenge=:id`), as a notification links it (R-NOTE-1), THE SYSTEM
  SHALL show that challenge's card first, then the deck as usual. IF the member
  has already answered it, or it is their own, or no longer shown, THEN the deck
  SHALL open as usual, revealing nothing about it (R-NAV-8).

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
- **R-CONN-2** — The system SHALL notify the target member, in the app and by
  email at the cadence they chose (R-NOTE-2), that someone wants to connect,
  including the requester's name and message/offer note, and in-app the
  relevant challenge/trend, but **not** the requester's email address.
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
- **R-CONN-7** — WHEN the target member **accepts** THE SYSTEM SHALL notify the
  requester, in the app and by email at the cadence they chose (R-NOTE-2),
  that they are now connected. The email carries the target's name and a link
  to the connection's contact screen, but no address and no challenge text
  (R-NAV-9). The connection's card SHALL stay outlined in the cockpit
  (R-MINE-6) until the requester first opens that contact screen, however the
  Matches badge (R-MINE-4) and the notifications screen (R-NOTE-5) are
  cleared. A decline is not
  announced (R-CONN-4).
- **R-CONN-8 (Already connected)** — IF the two members already share an
  accepted request, whichever side sent it, WHEN one of them initiates a
  connection THE SYSTEM SHALL record it as accepted at once, with nothing left
  for the target to answer, and SHALL take the requester straight to the
  contact screen. Both opted in to sharing addresses already, so nothing new is
  revealed (R-CONN-6). A connection about a challenge they are already
  connected over SHALL add nothing, and SHALL take the requester to the contact
  screen the same way.
- **R-CONN-9** — WHEN a connection is recorded under R-CONN-8 THE SYSTEM SHALL
  notify the target, in the app and by email at the cadence they chose
  (R-NOTE-2), that the requester connected with
  them over another challenge. The email carries the requester's name, their
  note and a link to the contact screen, but no address and no challenge text
  (R-NAV-9). The connection's card SHALL stay outlined in the cockpit
  (R-MINE-6) until the target first opens that contact screen, however the
  Matches badge (R-MINE-4) and the notifications screen (R-NOTE-5) are
  cleared.
- **R-CONN-10 (Connected over)** — The contact screen SHALL list, under
  _Connected over_, every accepted request between the two members, each with
  its challenge and trend, whether it was same boat or been there, and the note
  sent. The newest SHALL come first, those the viewer has not opened yet above
  the rest and outlined.
- **R-CONN-11** — WHEN the target accepts a request THE SYSTEM SHALL accept with
  it every other request pending between the same two members, whichever side
  sent it, since they are then connected (R-CONN-8). Those requests SHALL leave
  the waiting list and show under _Connected over_ (R-CONN-10); the requester
  SHALL be told once, as for the one accepted (R-CONN-7).

---

## 7. Matches cockpit

- **R-MINE-1** — The system SHALL provide a "Matches" screen that shows the
  member's own posted challenge(s) with per-challenge counts (same boat / been
  there / case studies) and a way to reopen the matches view.
- **R-MINE-2** — The "Matches" screen SHALL list **incoming connection requests
  waiting for the member** with Accept / Decline actions (this is where R-CONN-3
  / R-CONN-4 are triggered).
- **R-MINE-3** — The system SHALL show which trends the member is following.
- **R-MINE-4** — The navigation SHALL badge the "Matches" tab with what
  arrived since the member last opened the Matches screen: requests waiting for
  them and connections made with them (R-CONN-7, R-CONN-9), or new matches. The
  welcome screen SHALL badge its "Your matches" link the same way, since it
  shows no tab bar.
  - **Opening the Matches screen SHALL clear the badge**, whether or not the
    member answers what is waiting: an ignored request is an answer too
    (R-CONN-4). What stays to be done stays on the screen — the waiting
    requests (R-MINE-2) and the outlined connections (R-MINE-6).
  - While the member is on the Matches screen its tab SHALL carry no badge.
  - Seeing a notification SHALL NOT clear the badge, nor opening Matches the
    notifications' (R-NOTE-5, R-NOTE-6).
  - While the app is open and visible, the badges and the list of waiting
    requests SHALL refresh on their own, at most `limits.matchesPollSeconds`
    apart, so a new request shows without a reload.
- **R-MINE-5** — The "Matches" screen SHALL list the member's **connections** —
  accepted requests, whichever side sent them — below the requests waiting for
  them, each other member once, as a member card, however many challenges they
  are connected over (R-CONN-10). Each SHALL open that connection's contact
  screen (R-CONN-3). The list itself SHALL carry no email address; only the
  contact screen reads it (R-CONN-6). It SHALL refresh with the waiting list
  (R-MINE-4), so a request accepted on the other side shows without a reload,
  and SHALL mark a connection as new until the member first opens it
  (R-CONN-7, R-CONN-9).
- **R-MINE-6** — WHILE a connection holds accepted requests the member has not
  opened yet (R-CONN-7, R-CONN-9) THE SYSTEM SHALL list its card above the
  others, outlined, with a badge counting those requests.

---

## 8. Feedback

- **R-FB-1** — The system SHALL provide a feedback affordance that lets a member
  send feedback (pre-filled with the current screen/context) to the product
  owner, from the header menu (R-PROF-3). A `mailto:` is acceptable for beta.

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
- **R-ANA-4** — Analytics SHALL be **opt-in** (ADR 0026, ADR 0041): onboarding
  SHALL ask on a step of its own (R-ONB-6), with its own versioned words, apart
  from the data-usage consent (§3.3). The step SHALL offer two buttons of the
  same colour, size and weight, "Share usage data" and "No thanks", with
  neither chosen in advance. Its words SHALL say what is recorded, why, that it
  goes to Mixpanel in the EU, what is never included and where to change the
  choice. Choosing to share SHALL record the analytics consent
  version and time; the member SHALL be able to withdraw or give it later in
  the app as easily as at onboarding. THE SYSTEM SHALL capture events only for
  a member opted in at that moment, and never for a visitor who has not
  onboarded. The opt-in lives on the profile screen (R-PROF-2).
- **R-ANA-5** — The chosen tool SHALL have a usable free tier at summit scale
  (hundreds of users, thousands of events) and SHALL store event data in the EU.
  _(Resolved: Mixpanel offers EU data residency on the free plan at no extra
  cost — see `design.md` §7.)_
- **R-ANA-6** — WHEN a member chooses to share on the usage-data step of
  onboarding THE SYSTEM SHALL send `onboarding completed` (R-ANA-1) for that
  onboarding. For a member who declines there it SHALL NOT be sent, then or
  later (ADR 0041). THE SYSTEM SHALL record the first answer given on that
  step, either one, so that no later answer there sends it.

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
  | `/login/sent`                        | check your email, with the profile form        |
  | `/login/sent?invite=invalid`         | same, with the invalid-invite notice (R-INV-5) |
  | `/access-requested`                  | applicant: waiting for approval (R-AUTH-9)     |
  | `/sign-in#token=…`                   | magic-link landing: a button signs in          |
  | `/onboarding`                        | onboarding: profile (R-ONB-2)                  |
  | `/onboarding/privacy`                | onboarding: privacy summary (R-ONB-3)          |
  | `/onboarding/usage`                  | onboarding: optional usage data (R-ANA-4)      |
  | `/privacy`                           | full privacy notice (R-ONB-9)                  |
  | `/terms`                             | terms of use (R-ONB-13)                        |
  | `/impressum`                         | the people who made the app (R-PROF-4)         |
  | `/9torevolution`                     | the 9toRevolution game (R-GAME-1)              |
  | `/9torevolution/leaderboard`         | the 9toRevolution leaderboard (R-GAME-13)      |
  | `/welcome`                           | two doors                                      |
  | `/ask`                               | submit a challenge                             |
  | `/challenges/:id`                    | detected trend for that challenge              |
  | `/challenges/:id/trend`              | trend picker                                   |
  | `/challenges/:id/matches`            | same boat / been there / cases                 |
  | `/challenges/:cid/connect/:memberId` | connection request                             |
  | `/trends/:trendId`                   | trend detail + case studies                    |
  | `/offer`                             | swipe deck                                     |
  | `/offer?challenge=:id`               | swipe deck, opened at that card (R-OFF-7)      |
  | `/offer/:challengeId/note`           | write a "been there" note                      |
  | `/offer/done`                        | empty deck / session summary                   |
  | `/matches`                           | cockpit                                        |
  | `/matches/requests/:id`              | one request (pending, or accept/decline)       |
  | `/matches/requests/:id/contact`      | contact detail, accepted requests only         |
  | `/notifications`                     | the member's notifications (R-NOTE-5)          |
  | `/profile`                           | profile & privacy (R-PROF-1,2)                 |
  | `/admin/applicants`                  | admin approvals                                |
  | `/admin/invites`                     | invite links (R-INV-9)                         |
  | `/admin/members`                     | members (R-MEM-1,3, R-NFR-7)                   |
  | `/admin/members/:id`                 | a member's page (R-MEM-2)                      |
  | `/admin/settings`                    | the configuration (R-CFG-5,6)                  |
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
  NOT contain challenge text or contact details — the link leads to the app,
  where the normal privacy rules apply (R-CONN-2, R-NFR-1). The one exception is
  the request email, which carries the requester's name and note: the same the
  target sees on the request in the app, and what makes them answer it.
- **R-NAV-10** — The summit QR code SHALL point at the app root, optionally with a
  non-identifying campaign parameter for analytics and an **invite token**
  (R-INV-1), and follow the same routing. The invite token SHALL survive the trip
  to the login screen.
- **R-NAV-11 (Home in reach)** — The header, with the mark that leads home and
  the menu (R-PROF-3), SHALL stay at the top of the screen while the page
  scrolls, so that home is one tap away on a long screen without the tab bar,
  such as the privacy notice or the terms. Nothing on a screen SHALL stick where
  the header would cover it.

---

## 8c. Outbound message log and development deployment

Every message the system sends is recorded, in **every** environment. Outbound
email is otherwise a black box: there is no other place to look, and the first
question at a summit will be "did it actually go out?".

What differs by environment is only whether mail **leaves the machine**.

- **R-MSG-1 (Record everything, everywhere)** — WHEN the system sends or attempts
  to send a message THE SYSTEM SHALL record it in an **outbound message log**,
  regardless of environment. The record SHALL carry the recipient address, the
  message type (magic link, approval, connection request, admin notice,
  several notifications in one mail — R-NOTE-8), the
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
  retained for a bounded, configurable period rather than forever. An entry that
  quotes another member (a request email carrying the requester's name and note)
  SHALL be erased with that member too, and one quoting several members with
  each of them.
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
  minimum and maximum challenge length (R-ASK-3), minimum "been there" note
  length (R-OFF-4), magic-link token lifetime (R-AUTH-5), and the current
  consent version (R-ONB-3).
- **R-CFG-2** — Client and server SHALL read the **same** values, so the
  disabled-button rule on screen and the server-side validation can never
  disagree. The server SHALL expose them to the client rather than the client
  keeping its own copy.
- **R-CFG-3** — Server-side validation SHALL still enforce every threshold
  independently of the client (R-NFR-5): the config removes duplication, it does
  not remove the server check.
- **R-CFG-4** — Changing a threshold SHALL NOT require code changes beyond that
  file, so the values can be tuned during the pilot without a redeploy of logic.
- **R-CFG-5 (Settings in the host tools)** — A host with `settings:read` SHALL
  see every configured value on one screen, grouped by what it governs (for
  example "Spam protection"), each with a plain-language name, what it does,
  its value with its unit, and whether it differs from the default. Values
  fixed in code SHALL be marked as such. The screen SHALL NOT show environment
  variable names: they are a technical detail. No secret SHALL appear, nor
  whether one is set beyond on/off. Changing a value is a deployment change,
  except as R-CFG-6 allows.

- **R-CFG-6 (Changing settings in the host tools)** — A host with
  `settings:manage` SHALL be able to change, on the settings screen, the
  spam-protection numbers except the trusted proxies, the invite defaults, and
  the minimum challenge and "been there" note lengths (ADR 0031), and the
  9toRevolution switch and tuning (R-GAME-17, ADR 0045). Each change SHALL be
  checked against bounds and the order of paired limits (the minimum challenge
  length never above the maximum), take effect without a restart on every server
  within a minute, and show who made it and when. The host SHALL be able to go
  back to the deployment's value. Each changeable value SHALL be an editable
  field, saved on change and confirmed with the same "Saved" tick as the profile
  screen (R-PROF-1); a host without `settings:manage` sees it as text.

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
  technology. _(It replaces the prototype's "CR" button.)_ The choice SHALL be
  remembered per browser and SHALL change colours and decoration only, never
  content, behaviour or anything recorded, with one exception: happy mode
  reveals the 9toRevolution door and lets the game run (R-GAME-1, ADR 0045). IF
  the browser refuses storage THEN the app SHALL still switch, and start calm
  next time.
- **R-LOOK-3 (Modes are tokens)** — Colour modes SHALL be sets of colour tokens
  over one set of components, so a further mode (a dark mode, priorities C7) is a
  new token set rather than new screens. Every mode SHALL keep text readable
  against its background.
- **R-LOOK-4 (Same thing, same look)** — A thing the app shows in more than one
  place, such as a step header, a button, a card or a set of versioned words,
  SHALL be drawn by one component, so that it looks and behaves the same
  wherever it appears (constitution §4, ADR 0040).

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
  before deployment. It SHALL also refuse a change that edits, renumbers or
  removes a migration already on `main`, which has run on staging by then.
- **R-QA-5 (No secrets in CI)** — CI SHALL use non-production, synthetic
  configuration only. Real SMTP credentials, the Mixpanel production token, the
  session secret, and the real attendee whitelist SHALL NOT be available to the
  test workflow (R-NFR-5, R-SEED-5).
- **R-QA-6 (Green before launch)** — The pipeline SHALL be green on `main` as part
  of "feature-complete and tested" by 2026-11-01.
- **R-QA-7 (Dependency audit)** — `npm audit` SHALL report no known
  vulnerability in the installed dependencies. Where no upstream release carries
  the fix yet, an npm `overrides` entry MAY pin the patched transitive version;
  each such entry SHALL be removed once its upstream release carries the fix.

---

## 8g. Activity records

The team wants to know, after the event, how many challenges were posted and
by how many people, how often challenges were seen and how many "been there"
notes were given. Most of that is already in the database; what a member was
shown is not. Recording it and showing it are separate decisions: this section
records, and nothing here shows a number to anyone (ADR 0033).

- **R-STAT-1 (Deck views)** — WHEN a challenge card becomes the visible card
  in a member's swipe deck THE SYSTEM SHALL record a **view**: the member, the
  challenge and the time. Every showing is a view, the same card shown again
  included, so the records give both total views and how many members saw a
  challenge. A card sent ahead in a batch but never shown is not a view.
- **R-STAT-2 (Recorded, not shown)** — Views SHALL NOT be shown, exported or
  returned by any endpoint, to the member or anyone else, until a later
  decision says how activity is displayed (`tasks.md`). Any display SHALL show
  figures that combine many members, never what one person did. Views SHALL
  NOT be sent to the analytics tool (R-ANA-1..4): they are the app's own record,
  independent of the analytics opt-in.
- **R-STAT-3 (Kept with the account)** — Views SHALL be kept as long as the
  member's account exists, and erased with it (R-NFR-7). A challenge's views go
  with the challenge.
- **R-STAT-4 (Delete my history)** — The profile screen SHALL offer **deleting
  one's activity history**, apart from deleting the account: after one
  confirmation that says what goes, the member's views and their 9toRevolution
  day log (R-GAME-14) SHALL be deleted. Their challenges, "been there" notes,
  swipes, follows and connections SHALL stay; they are content and decisions,
  not history, and losing the swipes would deal every answered card again.
- **R-STAT-5 (Members are told)** — The data-usage consent SHALL say that
  activity is recorded and kept with the account, that the app may show
  combined figures, that personal data reaches another member only where a
  feature needs it, and that the history can be deleted (R-ONB-5).
- **R-STAT-6 (Invite opens)** — WHEN a visitor first presses, touches or types
  on the entry screen opened with an invite token THE SYSTEM SHALL record an
  **open** of that invite: the invite and the time, and nothing about who
  opened it. A browser that declares itself automated SHALL NOT count, and one
  tab SHALL count an invite once (ADR 0039). The invite links screen SHALL show
  each invite's count of opens beside its uses (R-INV-9); no other screen or
  endpoint SHALL show or return opens (R-STAT-2). Opens SHALL go with their
  invite and SHALL NOT be sent to the analytics tool (ADR 0038).

---

## 8h. Notifications

At the summit one member can receive many requests within an hour, and every
host receives a notice per applicant. Every notification is therefore kept in
the app, and each member decides per type whether and how often it also comes by
email (ADR 0037). Sign-in emails — magic links and approval links — are not
notifications: they go out at once, whatever is chosen here (R-NFR-3).

- **R-NOTE-1 (Types)** — THE SYSTEM SHALL notify:
  - **Connection request** — the target, when a request is made (R-CONN-2);
  - **New connection** — the requester, when their request is accepted
    (R-CONN-7), and the target, when a member already connected with them
    connects over another challenge (R-CONN-9);
  - **New challenge in a followed trend** — every member following the trend,
    except its author, when a challenge is posted in it, linking to the deck
    opened at its card (R-ASK-9, R-OFF-7);
  - **New applicant** — every member who can review applicants, when one is
    recorded (R-AUTH-2, R-AUTH-11).
- **R-NOTE-2 (Cadences)** — For each type a member can receive, they SHALL
  choose one of: **Immediately**, **Hourly**, **Daily**, **In the app only**,
  **Off**. New applicant notices SHALL also offer **Every 15 minutes**. Until
  a member chooses, connection requests and new connections SHALL be
  **Hourly**, new challenges in a followed trend **Daily**, and new applicants
  **Every 15 minutes**.
- **R-NOTE-3 (Choosing)** — The profile screen SHALL offer the choice for each
  type the member can receive, and only those, saved on change like every
  setting there (R-PROF-1). A change SHALL apply to every notification still
  waiting to be mailed. Setting a type to **Off** SHALL also hide its
  notifications the member has not seen yet; those already seen stay listed.
- **R-NOTE-4 (Kept in the app)** — WHEN a notification arises THE SYSTEM
  SHALL store it for its recipient, whatever its type is set to, together with
  the event that causes it (R-NOTE-10). For a type set to **Off** it SHALL be
  stored **hidden**: never listed, counted or mailed, and still hidden if the
  member later chooses otherwise. A notification SHALL refer to what it is
  about — the request, the challenge, the member — and SHALL be worded when
  shown, so it never repeats a name or words that have since changed or gone.
- **R-NOTE-5 (The notifications screen)** — The member's notifications SHALL
  be listed, newest first, on their own screen (`/notifications`). Each entry
  SHALL say in one line what happened, naming the member it is about but
  quoting no challenge text or note, with its time (R-NAV-9).
  - **Tapping an entry**, anywhere on it, SHALL open the screen the
    notification comes from: a connection request its request
    (`/matches/requests/:id`), a new connection its contact screen
    (`/matches/requests/:id/contact`), a new challenge in a followed trend the
    deck opened at its card (`/offer?challenge=:id`, R-OFF-7), and a new
    applicant the applicants list (`/admin/applicants`). The email for the same
    notification SHALL link to the same screen (R-NOTE-8). Back SHALL return to
    the notifications screen (R-NAV-1).
  - An entry SHALL be **new** until the member has opened this screen while it
    was listed, or the screen it opens. A hidden entry (R-NOTE-4), an entry
    about a member whose account is deleted, or one about anything the member
    may no longer open SHALL NOT be shown (R-NAV-8, R-NFR-7).
- **R-NOTE-6 (In the menu)** — WHILE the member has new notifications the
  header's menu button SHALL carry a badge with their number, and the menu
  item SHALL read **Notifications (n new)**; without any it SHALL read
  **Notifications**, with no badge and no number. Both SHALL refresh as the
  navigation badge does (R-MINE-4).
- **R-NOTE-7 (When mail goes out)** — A member's mail SHALL be grouped by
  cadence, never by type: every type on the same cadence goes out in one mail.
  - **Immediately** — each notification in its own mail, within a minute.
  - **Every 15 minutes** and **Hourly** — WHEN a notification arises and no
    mail of that cadence went to the member within the window (15 or 60
    minutes) THE SYSTEM SHALL mail it within a minute; otherwise it SHALL wait
    and go out with everything gathered since, one window after that last mail.
    Only mail of the same cadence starts the window.
  - **Daily** — one mail a day at the configured time, with everything gathered
    since the last.
  - **In the app only** — no mail.
  - **Off** — no mail; unseen notifications of the type are hidden (R-NOTE-3,
    R-NOTE-4).
- **R-NOTE-8 (What the mail says)** — A mail carrying one notification SHALL be
  that type's own email (R-CONN-2, R-CONN-7, R-CONN-9). A mail carrying several
  SHALL say how many in its subject and list each with its own link, under the same
  rules as the single email (R-NAV-9).
- **R-NOTE-9 (Nothing stale)** — Before mailing THE SYSTEM SHALL leave out
  every notification the member has seen in the app (R-NOTE-5), a request no
  longer pending, an applicant already decided, a challenge no longer shown,
  and anything about a member whose account is deleted. IF nothing is left
  THEN no mail SHALL go out.
- **R-NOTE-10 (Delivered once, despite failures)** — A notification SHALL be
  stored with the event that causes it, so the event stands even when the mail
  fails. A mail the transport refuses SHALL be tried again, waiting longer each
  time, up to a configured number of attempts; every attempt is recorded in the
  outbound log (R-MSG-1). No notification SHALL be mailed twice, however many
  servers run.
- **R-NOTE-11 (Kept for a while)** — Notifications SHALL be deleted after a
  configured number of days, and SHALL be erased with their recipient, with
  the member they are about, and with the request or challenge they refer to
  (R-NFR-7).

---

## 8i. 9toRevolution, the office game

An easter egg for members who play with the colours: a top-down office game
behind the impressum's last card, in the spirit of the browser's offline
dinosaur game. The player starts as the boss of a grey office, crushing the
spirit of every employee who turns colourful, is promoted through five jobs,
and as CEO may turn rebel, after which the game runs in reverse. Its results
feed a leaderboard where nobody's real name appears unless they share it.
_(Decided by the maintainer: ADR 0045. Numbers below marked "setting" are
defaults hosts can tune, R-GAME-17.)_

**Words.** A **level** is one working **day**, 09:00 to 17:00 on the game's
clock. Levels 1–15 are **boss mode**, three days per **job**: Team Lead
(1–3), Manager (4–6), Director (7–9), VP (10–12), CEO (13–15). Levels 16 and
on are **rebel mode**, all of them the job **Rebel**. An **employee** is one of
the office's people; the **player** is the character the member steers.

- **R-GAME-1 (The door)** — WHILE the game is switched on (R-GAME-17), the
  colour mode is happy and the visitor is a member who completed onboarding,
  turning the phone to landscape while the impressum (R-PROF-4) shows its
  community card SHALL open `/9torevolution` and start the game; that card
  SHALL carry a small turn-the-phone sign, and on a screen without touch a
  **Be a rebel** button that does the same (ADR 0046). WHEN the mode is calm
  THE SYSTEM SHALL show neither the sign nor the game: `/9torevolution` shows "The rebels
  only come out in happy mode" with a link to the impressum, and a running game
  pauses there (R-GAME-12). WHILE the game is off, `/9torevolution`,
  `/9torevolution/leaderboard` and every game endpoint SHALL answer as not found
  (R-NAV-8). A visitor not signed in, or not yet onboarded, SHALL follow the
  deep-link rules (R-NAV-5, R-NAV-7).
- **R-GAME-2 (The office)** — Each job SHALL be played on its own fixed floor
  plan, larger with each job, holding an **entrance**, a **meeting room**, one
  **cubicle** per employee, the boss's **office**, and the job's number of
  **water coolers**: Team Lead 4 employees and no cooler, Manager 8 and 1,
  Director 14 and 1, VP 22 and 2, CEO 32 and 2 (setting, within what the floor
  plan holds). Rebel mode SHALL use the CEO floor with the office replaced by
  the player's own **desk**. Walls SHALL be thin and block the player only as
  far as they are drawn, and an office plant SHALL stand in the office and in
  the open plan, in everyone's way.
- **R-GAME-3 (A day)** — Each day SHALL begin at 09:00 with every employee
  walking in through the entrance to their cubicle. In boss mode a number of
  them SHALL arrive already as rebels, and in rebel mode already grey (setting,
  per job). The clock SHALL reach 17:00 after the day's length (setting,
  default 90 seconds), and a day survived to 17:00 is **won**.
- **R-GAME-4 (Temptation and files, boss mode)** — An employee is **grey**,
  **tempted** or a **rebel**. At random moments (setting, per job) a grey
  employee's screen SHALL switch to Corporate Rebels, which makes them tempted.
  No screen SHALL turn in the day's first seconds (setting), and the rate SHALL
  rise through the day from a share of its average at 09:00 to a share at 17:00
  (settings), the same on average (ADR 0046). The player SHALL carry at most one
  **file**, taken from the stack on their desk. Assigning a file to a tempted
  employee SHALL make them grey and busy with it for a while (setting);
  assigning one to a rebel SHALL make them tempted, so a rebel needs two files.
  A file SHALL be assignable only to a tempted employee or a rebel. The player
  MAY instead leave a file on the desk of an employee who is not at it, one at
  a time; WHEN that employee next sits down there THE SYSTEM SHALL hand them
  the file as if assigned, and a grey employee SHALL be busy with it. WHEN an
  employee stays tempted longer than the grace time (setting, per job) THE
  SYSTEM SHALL make them a rebel. A rebel arises in no other way than this and
  R-GAME-5.
- **R-GAME-5 (The water cooler, boss mode)** — From Manager on, employees
  SHALL now and then walk to a water cooler (setting), at most two at a cooler.
  WHEN a rebel has talked with a grey employee there for the chat time
  (setting) THE SYSTEM SHALL make the grey one tempted, and the break SHALL end
  then at the latest, both returning to their cubicles. The player SHALL be
  able to break it up by **talking** to them at the cooler for the speech time
  (setting, default 2 seconds): "It doesn't work without hierarchy." Both go
  back to their cubicles unchanged. Assigning a file at the cooler SHALL both
  break it up and count as assigned (R-GAME-4).
- **R-GAME-6 (Meetings, boss mode)** — From Manager on, WHEN the player walks
  into the meeting room, and has not held a meeting that day, THE SYSTEM SHALL
  start a meeting: the employees nearest the meeting room, as many as the job
  seats (Manager 2, Director 3, VP 4, CEO 5, setting), walk in, and the player
  stays in the room for the meeting's length (setting, default 8 seconds).
  Every tempted employee and rebel who attended SHALL leave it grey; the rest
  of the office carries on meanwhile.
- **R-GAME-7 (Losing)** — WHEN more than half of the employees are rebels in
  boss mode, or grey in rebel mode, THE SYSTEM SHALL end the day as **lost**
  at once. After a loss the player SHALL continue from the first day of the
  job they were playing (Rebel: level 16).
- **R-GAME-8 (Becoming CEO)** — WHEN the player wins level 15 THE SYSTEM SHALL
  show "Every spirit crushed. The board is thrilled.", the player's own screen
  turning colourful, and two buttons: **Continue**, which leaves the game for
  `/ask`, and **Be a rebel**, which starts level 16.
- **R-GAME-9 (Rebel mode: files and heat)** — In rebel mode employees are
  rebels or grey, and the roles turn: files SHALL land on employees' desks, at
  an interval that shortens with each level down to a floor (setting). A file
  SHALL lie on the desk next to its employee, and while it does their **heat**
  SHALL rise through warm, hot and boiling, one stage per heat time (setting);
  after boiling they turn grey. The player **helps** by standing at the desk
  for the help time (setting, default 2 seconds), which removes the file and
  stops the heat rising, without lowering it.
- **R-GAME-10 (Breaks)** — The player SHALL be able to send an employee on a
  **break**, at most once per break cooldown (setting). The employee leaves
  their desk for 15 seconds (setting), receives no file meanwhile, and returns
  with no heat. A file already on the desk SHALL stay there, and the player
  SHALL be able to help with it while they are away.
- **R-GAME-11 (Talking and the masterclass, rebel mode)** — Grey employees
  SHALL now and then walk to a water cooler; WHEN a grey and a rebel employee
  meet there THE SYSTEM SHALL raise the rebel's heat to hot. Talking to an
  employee for the talk time (setting, default 4 seconds) SHALL turn a grey
  one back into a rebel, at their desk or at a cooler; at a cooler it turns at
  most one grey employee and also takes a stressed rebel's heat away. Once a
  day the player SHALL be able to start a **masterclass** at their desk by
  choosing two grey employees, who leave through the entrance and return as
  rebels after the masterclass time (setting, default 8 seconds). The player
  moves freely meanwhile.
- **R-GAME-12 (Controls and view)** — The game SHALL be played in landscape,
  filling the window and going full screen where the browser allows; days,
  their results and the next day SHALL follow each other there without the
  phone turning. Held in portrait, the game SHALL pause and show the lobby, a
  portrait screen with the pseudonym, where to play from, sharing and the
  leaderboard; turned back, the same day SHALL carry on (ADR 0046). On a touch screen
  a joystick appears where the left thumb rests; on a keyboard the arrows or
  WASD steer. One **action button** SHALL light up and name what the player can
  do where they stand: _Take file_, _Assign_, _Break it up_, _Help_, _Break_,
  _Talk_, _Masterclass_. Walking into the meeting room needs no button
  (R-GAME-6). WHERE two actions are possible at once, as help and break at a
  desk, the first press SHALL open both as buttons beside it and the second
  choose; on a keyboard Space helps and E sends on a break, directly. The
  masterclass's two employees SHALL be chosen by tapping them, or with the
  arrows and Space. The camera SHALL follow the player, arrows at the screen's
  edge SHALL point to trouble out of view (a tempted employee, a rebel, rising
  heat, a grey employee), and a floor map SHALL open and close from a button.
  A pause button SHALL stop the game, as SHALL hiding the tab or switching to
  calm mode; a paused game's clock and play time stand still.
- **R-GAME-13 (Leaderboard)** — `/9torevolution/leaderboard` SHALL rank each
  player's best result: by job, Rebel above CEO above VP above Director above
  Manager above Team Lead, then by level, then by the shorter total play time
  until that best was first reached (R-GAME-16). Each row SHALL show the place,
  the name or pseudonym (R-GAME-15), the job and the level, and the member's own
  row SHALL be marked. It is shown only under the conditions of R-GAME-1.
- **R-GAME-14 (Results and the day log)** — WHEN a day ends THE SYSTEM SHALL
  record it in the **day log**: the member, the level, won, lost or abandoned,
  the play time and when. A day the member leaves unfinished, by leaving the
  game or closing the tab, is recorded as abandoned where the browser lets the
  record be sent. The game SHALL then show a results card with the outcome,
  the spirits crushed (boss mode) or people helped (rebel mode), the day's
  time, and where the member's best stands on the leaderboard ("You're #7 of
  42"). Its buttons SHALL be, for a new personal best: **Share and continue**,
  **Continue** and **Leave**; for another win: **Continue** and **Leave**; for a
  loss: **Retry** and **Leave**. _Share and continue_ and _Retry_ SHALL stand
  out. The card SHALL show in landscape, over the floor, and _Leave_ SHALL go
  to the lobby. The day log is recorded, not shown (R-STAT-2): nothing but the
  leaderboard and the results card shows anything derived from it.
- **R-GAME-15 (Pseudonyms and sharing)** — Each player SHALL get, at their first
  game, a pseudonym of an adjective and "Rebel" ("Furious Rebel"), unique among
  players, kept for good. The leaderboard SHALL show the pseudonym unless the
  member shared their name, then the name on their profile. _Share and
  continue_ shares it, and the lobby SHALL let the member share or stop
  sharing at any time. Which member stands behind a pseudonym SHALL NOT be
  shown, exported or returned by any screen or endpoint, to hosts or anyone
  else; it lives in the database only (ADR 0045).
- **R-GAME-16 (Progress)** — THE SYSTEM SHALL keep each player's progress with
  their account: the level they are playing, the highest level reached, their
  best and its total play time, which hints they have seen, and their
  pseudonym and sharing choice. A member returning after leaving or closing
  the tab SHALL continue from the first day of the job they were in, as after a
  loss (R-GAME-7). The lobby SHALL let them **play from** the first day of
  any job up to the highest level reached; a loss there sends them to the first
  day of that job. The total play time counts every day played, lost and
  abandoned ones included, and the best keeps the total from when it was first
  reached, so replaying never changes it. Progress, the day log and the
  pseudonym go with the account (R-NFR-7); deleting the activity history takes
  the day log only (R-STAT-4).
- **R-GAME-17 (Switch and tuning)** — Hosts with `settings:manage` SHALL switch
  the game on and off and change its tuning on the settings screen, as R-CFG-6
  describes; it is off by default. A changed number SHALL apply from the next
  day a player starts, never in the middle of one. Switching the game off SHALL
  take effect as R-CFG-6 describes for every setting, and a game already
  running SHALL be refused its next record.
- **R-GAME-18 (Look and readability)** — The office SHALL be grey; colour
  belongs to rebellion. Characters SHALL be drawn as smooth vector figures in
  suits, with a range of skin tones and hair, and a grey employee is the whole
  figure desaturated, never a change of skin colour. Every state SHALL also
  show as a shape: a tempted employee's screen carries the CR logo, a rebel
  raises a fist and wears a colourful hairdo, a grey employee in rebel mode
  slumps, and heat shows as a flush, then sweat, then steam over a heat bar.
  The first time a member meets a mechanic (the first day, the water cooler,
  meetings, rebel mode) the game SHALL show a short hint, once per member; the
  first day's hint opens with keeping the workers busy. The lobby SHALL keep
  every hint under "How to play", to read again at any time. The game makes no
  sound.
- **R-GAME-19 (Usage data)** — For a member opted in (R-ANA-4) THE SYSTEM SHALL
  send `game_opened`, `game_day_finished` with the mode, level, outcome and
  whole seconds, and `game_result_shared`, with no name or pseudonym
  (R-ANA-3).
- **R-GAME-20 (Plausible records)** — THE SYSTEM SHALL refuse a day record for
  a level above the highest reached plus one, or with a play time outside what
  a day can take, and SHALL limit how many records a member sends per minute.
  It SHALL do no more against a faked score (ADR 0045).

---

## 9. Non-functional requirements

- **R-NFR-1 (Privacy)** — Challenge text and member contact details SHALL be
  visible only to authenticated, whitelisted members, and contact details only
  after mutual opt-in. No public/unauthenticated page exposes member data.
- **R-NFR-2 (Mobile-first)** — All member-facing screens SHALL be usable on a
  phone in portrait, since the launch mechanic is scanning a QR code during a
  break. The 9toRevolution game alone is played in landscape (R-GAME-12); its
  leaderboard is a portrait screen like any other.
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
- **R-NFR-8 (Abuse limits)** — THE SYSTEM SHALL limit the sign-in endpoints
  (ADR 0029), every number configurable (R-CFG-1):
  - per address per 15 minutes, 3 link emails freely; from the 4th to the 10th
    a request SHALL require the **human check** first (ADR 0030); past 10 it
    SHALL show the same screen and send nothing, revealing nothing;
  - at most 1000 requests per IP address per 15 minutes across the sign-in
    endpoints and the invite-open record (R-STAT-6); past it the visitor SHALL be asked to try again in a few
    minutes;
  - after 30 new applicants from one IP address in an hour, recording another
    SHALL require a **human check**; past 300 in an hour, none SHALL be
    recorded until the hour has passed. Members, visitors admitted by a usable
    invite and an address asking again SHALL NOT count; a refused invite SHALL
    count like any new applicant, or a made-up token would skip the limit;
  - the human check SHALL run on our own server, with no third party, cookie or
    device identifier, and ask nothing of a visitor beyond a moment's wait
    (R-NFR-1, R-NFR-2);
  - the client's IP address SHALL be read from a forwarded header only behind
    a proxy the configuration trusts.
- **R-NFR-6 (Auditability of consent)** — The system SHALL retain, per member,
  the consent version and acceptance timestamp.
- **R-NFR-7 (Deletion)** — The system SHALL support deleting a member and the
  personal data attached to them — challenges, connection requests, swipes,
  deck views (R-STAT-3), follows, role grants, notifications (R-NOTE-11), the
  profile draft (R-ONB-15), their 9toRevolution progress, results and pseudonym
  (R-GAME-16), and their **outbound message log entries** (R-MSG-6) — on
  request (GDPR erasure), at minimum via an admin action. Deleting SHALL first
  **deactivate** the account at once: no sign-in, and nothing of theirs shown
  to anyone. The erasure SHALL follow after a **grace period** of 30 days
  (configurable), during which a host can undo it, and so can the person, by a
  link emailed to their address, when they deleted the account themselves; a
  host MAY erase at once (ADR 0032).
- **R-NFR-9 (Operability)** — THE SYSTEM SHALL record every request it
  answers with a 500 and every failed background run with enough to find the
  cause: the error's name, its message and stack with anything shaped like an
  email address removed from both, the request's method and path without its
  query string, the status, and a request id that the 500 response also
  carries, so a member's screenshot can be matched to one log line. It SHALL NOT record a
  header, a body, a cookie, a token, an email address, a name or a challenge's
  words (R-ANA-3, constitution §5). Log lines SHALL be structured, one JSON
  object each, so the hosting platform can search and alert on them.
- **R-NFR-10 (Availability monitoring)** — Production SHALL be watched from
  outside the application: a check of `GET /api/health` expecting the
  database up, at least every five minutes, and an alert to the hosts when
  it fails twice in a row, when the share of requests answered with a 5xx
  rises above a configured threshold over five minutes, or when a scheduled
  job fails. An alert names the deployment and the failing check, and
  nothing about any member.
- **R-NFR-11 (Which version is running)** — The menu SHALL show at its foot,
  small and muted, the version that is running: the short commit the build was
  made from, linking to that commit in the repository, so a member reporting a
  problem and a developer looking at a deployment can name the same build.
  Every deployment of one build SHALL show the same version; a build made
  without a commit, such as on a developer's machine, SHALL show `dev`.
  `GET /api/config` SHALL carry it (R-CFG-2).
- **R-NFR-12 (Open source)** — The source code SHALL be published under an
  open-source license, kept in `LICENSE` at the repository root, that obliges
  anyone who copies or redistributes it to keep the copyright notice. That
  notice SHALL name the founders, Pascal Dulex, Ivo Pejakovic and Andy Moesch,
  and the Rebel Match contributors.

---

## 10. Seed content

Seeding is **environment-specific**: a dev deployment and production never share
fixtures. `design.md` §6 lists the exact records and the profile mechanism.

- **R-SEED-1 (Shared content)** — Both environments SHALL be seeded with the
  **role records** (`member`, `admin`) and the curated product content: the **8
  trends** (number, short name, "from" label, peer count, keywords) and the
  per-trend **case studies** (organization, Corporate Rebels URL, takeaway), and
  the **sector** and **company size** lists (R-ONB-2), so the app is
  demonstrable without user-generated data.
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
- **R-SEED-9 (First admins)** — The production seed SHALL grant the `member`
  and `admin` roles to the addresses configuration names (`SEED_ADMINS`), so a
  new deployment has someone who can approve applicants and grant roles
  (R-ROLE-9). The addresses come from configuration, never from the repository
  (R-SEED-5), and each starts un-onboarded (R-SEED-6). Only an address new to
  the database is granted: a re-run SHALL NOT give back a role a host took
  away. The dev profile SHALL refuse `SEED_ADMINS`; it has its own admin
  (R-SEED-2).

---

## 11. Open questions

1. **Consent text** — who owns the legal/data-usage copy and its versioning?
2. **Admin UI depth** — is a minimal approvals list enough for beta, or is a
   fuller admin screen needed?
3. **Notifications** — _(Resolved; see below. The number is kept because other
   documents cite question 4.)_
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
6. **Controller and contact** — _(Resolved; see below.)_
7. **Full privacy notice** — _(Resolved; see below.)_

### Resolved

- **Controller and contact** (2026-10-07) — the controller named on the privacy
  step and in the notice is **Transformation Architects GmbH**, c/o Impact Hub
  Zürich AG, Sihlquai 131, 8005 Zürich, reached at
  `ready@transformation-architects.ch` (R-ONB-5). This also answers who owns
  the consent copy (question 1). Assumed for now; the company's agreement is
  still to be confirmed (`tasks.md`, M1).
- **Full privacy notice and terms of use** (2026-10-07) — both are written on a
  best-effort basis from free templates: the notice from the DSAT.ch model
  privacy notice, the terms from the Basecamp open-source policies, both
  CC BY 4.0 and credited on the screen. Rebel Match is a free open-source
  project without a lawyer, so **neither text is legally reviewed**; the
  maintainer accepts that and approved both. They are
  `docs/legal/privacy-notice.md` and
  `docs/legal/terms-of-use.md` (R-ONB-9, R-ONB-13).
- **Email delivery provider** (2026-10-01) — the team has its **own SMTP server**
  available; no third-party transactional service (SendGrid/Postmark/SES) is
  needed for the beta. The app connects via nodemailer using `SMTP_*`
  environment configuration (R-NFR-5, design §1). Remaining sub-question: the
  sending domain, tracked as open question 4 above.
- **Notifications** (2026-10-05) — the target of a connection request is
  emailed at launch, not only badged in the app: hosts need to see the message
  in the outbound log to test matching on staging, and the email is what brings
  members back after the summit. The email follows R-NAV-9 (R-CONN-2, S4).
- **Accept notice** (2026-10-05) — the requester is told when their request is
  accepted, by a badge and by email; until then they had to look. A decline
  stays silent, as a request ignored does (R-CONN-7, R-CONN-4).
- **Already connected** (2026-10-05) — a second connection between two members
  already connected was listed as a second connection, once per challenge.
  Now it is accepted at once and listed under the one connection, as what they
  are connected over, with the target told (R-CONN-8..10, R-MINE-5,6, ADR 0035).
  Accepting one of several requests pending between two members accepts them
  all (R-CONN-11).
- **Notification cadences** (2026-10-05) — every notification is kept in the
  app, and each member picks per type how it arrives by email: immediately,
  hourly, daily, in the app only, or not at all; applicant notices also every
  15 minutes. Types on the same cadence share one mail (R-NOTE-1..11,
  ADR 0037).
- **Seed data** (2026-10-01) — split by environment rather than chosen between:
  prototype fixtures for dev, real whitelist + collected challenges for
  production. See §10 (R-SEED-1..7) and `design.md` §6.
