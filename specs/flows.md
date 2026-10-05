# Rebel Match — User Flows

Every journey through the beta, written out step by step. This is the connective
tissue between [`requirements.md`](requirements.md) (what must be true) and
[`design.md`](design.md) (screens §4, API §3): each flow names the screens it
touches, the endpoints it calls, and the requirements it satisfies.

Conventions:

- **Happy path** is the numbered list. **Branches** cover alternates and errors.
- Screen numbers (`S1`…`S22`) refer to `design.md` §4.
- A flow is "done" only when its branches are implemented too — the error
  branches are where the privacy model lives.

---

## Flow map

```
   [QR code on badge/screen]        [deep link in an email / a shared URL]
              │                                   │
              ▼                                   ▼
   F1 Entry & login  ◄──────────────  F13 Deep link (remembers the target)
       │      │
       │      ├──(unknown email + valid invite)──►  F15 Join by invite ──┐
       │      └──(unknown email, no invite)─────►  F4 Request access     │
       │                                               │                 │
       │                                               ▼                 │
       │                                        F10 Admin approval       │
       ▼                                               │                 │
   F2 First-time onboarding (name + consent)  ◄────────┴─────────────────┘
       │                       ◄── R-NFR-3 budget ends here
       ▼
   F3 Welcome — two doors   (or straight on to the deep-linked screen)
       ├──►  F5 Ask for help  ──►  F7 Connect (double opt-in)
       └──►  F6 Offer help    ──►  F7 Connect (double opt-in)
                   │
                   ▼
            F8 Matches cockpit  ──►  F7 (accept / decline)
                   ├──►  F9 Follow a trend
                   └──►  F12 Feedback

   Admin only: F10 Approvals · F16 Invite links · F11 GDPR deletion
               F14 Outbound message log
```

---

## F1 — Entry & login (QR → magic link)

**Actor:** invited summit attendee, on a phone, during a break.
**Precondition:** their email is on the whitelist.
**Screens:** S1 Login → S2 Magic-link landing.
**Budget:** this flow plus F2 must complete in **under 2 minutes** (R-NFR-3).

1. Member scans the QR code; the phone browser opens the app root.
2. App has no session → shows **S1 Login**: single email field, no password
   (R-AUTH-8).
3. Member types their email and submits → `POST /auth/request-link`.
4. Server finds an active whitelisted member, creates a single-use token (stored
   hashed, 15-min expiry), emails the magic link (R-AUTH-1, R-AUTH-4, R-AUTH-5,
   R-NFR-5).
5. S1 switches to a "check your email" state. An address that is **not** on the
   whitelist goes to a different screen instead (**F4**) — the two states differ
   on purpose, so email enumeration through this form is possible and accepted
   (R-AUTH-4, ADR 0013). Rate-limiting is what keeps it expensive.
6. Member opens the email on the same phone and taps the link →
   **S2** `/sign-in#token=…`, which shows a **Sign in** button. Opening the link
   uses nothing, so a mail scanner or a chat preview that fetched it first has
   not spent it (R-AUTH-5, ADR 0027).
7. Member taps **Sign in** → `POST /auth/verify`. Server validates and consumes
   the token, creates a signed http-only session cookie that survives closing
   the browser (R-AUTH-5, R-AUTH-7, R-NFR-5).
8. **S2** routes onward: onboarding not yet complete → **F2**; otherwise → **F3**
   (R-ONB-1).

**Branches**

- _Email not on the whitelist, no invite_ → **F4**: recorded as an applicant, an
  admin is notified, and they land on the access-requested screen (R-AUTH-2).
- _Email not on the whitelist, but the QR carried a valid invite_ → **F15**: they
  are admitted straight away and never see the queue (R-INV-1).
- _Link expired, already used, or unknown_ → error screen with a "send me a new
  link" action, returning to step 3 (R-AUTH-6).
- _Email is slow to arrive_ → the "check your email" state offers resend after a
  short delay. Delivery is inside the R-NFR-3 budget and should land within 30 s.
- _Member already has a valid session_ (returning during the same summit) → skip
  to **F3**; this is the common case after the first break (R-AUTH-7).
- _Rate limiting_ — repeated link requests for the same address are throttled
  (design §8) without changing the on-screen state.

---

## F2 — First-time onboarding (name + consent)

**Actor:** authenticated member who has not completed onboarding.
**Screens:** S3 Onboarding.
**Ends the R-NFR-3 measurement.**

1. Any authenticated route detects incomplete onboarding — a missing name, or an
   unaccepted current consent version — and forces **S3** before anything else
   (R-ONB-1).
2. Member enters their **display name** (required), pre-filled from what they
   gave at the door if they came through **F4** (R-AUTH-12). Job title,
   organization, sector and company size are optional and only feed the match
   cards; sector and company size are picked from a list (R-ONB-2).
3. Member reads the data-usage consent, which states plainly that **email
   addresses are shared only when both sides accept a connection**, and that the
   app is closed to whitelisted members (R-ONB-5).
4. Member ticks explicit acceptance and submits → `POST /api/onboarding` with
   `{name, jobTitle?, org?, sector?, companySize?, consentVersion}`.
5. Server stores the profile plus the consent version and timestamp (R-ONB-3,
   R-NFR-6). **Stopwatch for R-NFR-3 stops here.**
6. Member lands on **F3**.

**Branches**

- _Name empty_ → submit stays disabled.
- _Consent not accepted_ → submit stays disabled; the app remains blocked
  (R-ONB-4).
- _Consent version has since changed_ → on a later visit the consent is
  re-presented and must be re-accepted before the app opens again (R-ONB-4).

---

## F3 — Welcome: two doors

**Screens:** S4 Welcome.

1. Member sees two choices: **Ask for help** → **F5**, **Offer help** → **F6**.
2. Bottom navigation also reaches the **Matches cockpit** (**F8**), with a badge
   when requests are pending (R-MINE-4).

---

## F4 — Request access (not yet whitelisted)

**Actor:** someone who heard about the app but was not invited, and whose QR code
carried no usable invite — so a person has to let them in.
**Screens:** S1 Login → S21 Access requested.
**Outside the R-NFR-3 budget**, since a human approval sits in the middle. When
that wait is unacceptable, the answer is an invite link (**F15**), not a faster
queue. Everything after the approval is built to cost zero extra steps.

1. They submit an email on **S1** that is not on the whitelist, with no invite
   token or an unusable one.
2. Server records a pending **applicant** and notifies an admin — no token, no
   session (R-AUTH-2).
3. They land on **S21** (`/access-requested`), a screen of its own, which says in
   plain language: thanks for your interest in Rebel Match; access is approved by
   a person; **we will email you as soon as it is approved, and that email will
   contain your login link**. No false "check your email" — there is nothing in
   their inbox yet, and saying so prevents the refresh-and-wait loop (R-AUTH-9).
4. IF they arrived with an invite that was refused, **S21** carries a notice above
   that message — _"this invitation link isn't valid right now"_ — and the URL
   becomes `/access-requested?invite=invalid`, so a reload keeps it. The notice
   never replaces the primary message, and it never says which control refused the
   link (R-INV-5).
5. **S21** also offers an optional name and organization — "so the host can find
   you" — which is what makes R-AUTH-11 work in a crowded room. Skipping it
   changes nothing; the request is already recorded (R-AUTH-12).
6. An admin resolves it in **F10**. On approval the applicant gets a **working
   magic link in the approval email itself**, not a notice telling them to go and
   request one: one tap and they are in **F2** (R-AUTH-3, R-AUTH-10). On
   rejection they cannot log in and no challenge data is kept for them.

**Branches**

- _Approval link expired_ (issued without being asked for, so it lives 24 hours
  rather than 15 minutes) → the normal expired-link screen with a resend, never a
  dead end (R-AUTH-6, R-AUTH-10).
- _Applicant requests access again while pending_ → same screen, no duplicate
  applicant, and the admin notification is not repeated.
- _The host finds them first_ → the pending list carries the email, request time,
  and any name given, so a host can approve on the spot and the link arrives
  while the two of them are standing there (R-AUTH-11, **F10**).
- _Already-whitelisted address typed here_ → that is **F1**, not this flow; the
  two states are deliberately different screens (R-AUTH-4, ADR 0013).
- _Address was rejected earlier_ → not this screen: the login screen says the
  request was not approved, rather than promising an email (R-AUTH-13).

---

## F5 — Ask for help (challenge author)

**Actor:** onboarded member with a problem.
**Screens:** S5 Submit → S6 Domain/trend (→ S7 Trend picker) → S8 Matches for
my challenge.

1. **S5**: member writes one challenge in free text, guided by prompts (what they
   observe, what they want to change, where they struggle) (R-ASK-1).
2. Read-only example hints sit beside the field as inspiration — there is no
   "insert this example" action, by design (R-ASK-2).
3. Submit stays disabled until the text is longer than 30 characters
   (`limits.challengeMinChars`), with a live counter (R-ASK-3, R-CFG-2).
4. Submit → `POST /api/challenges`; the challenge is persisted and the
   keyword matcher assigns a trend (R-ASK-4, R-ASK-5, design §5).
5. **S6** shows the detected trend with its "from → to" framing and the peer
   line, plus a way to see all 8 trends (R-ASK-6).
6. Member confirms, or goes to **S7** (`/challenges/:id/trend`) and overrides the
   trend → `PATCH /api/challenges/:id` records the override (R-ASK-7).
7. **S8** opens with a green banner — the challenge is live and members who can
   help will now see it (R-ASK-11) — and shows `GET /api/challenges/:id/matches`:
   **rebels facing this now** (same boat), **rebels who've been there**, and
   curated case studies as **rebel organizations that did it** — names and roles
   only, never email addresses (R-ASK-8, R-ASK-12, R-NFR-1).
8. From a match card the member can **Follow** the trend (**F9**) or **Connect**,
   which opens **F7** — not a `mailto:` (R-ASK-9, R-ASK-10).

**Branches**

- _No peers yet_ (early at the summit) → each empty section says other rebels
  will find the challenge in their deck, the case studies still render, and the
  screen offers the way on to Offer help (**F6**), so it is never a dead end
  (R-ASK-13).
- _Matcher finds no keyword hit_ → fall back to the lowest-confidence trend and
  rely on the member's override in step 6 (design §5).

---

## F6 — Offer help (swipe deck)

**Actor:** onboarded member willing to help.
**Screens:** S10 Swipe deck → S11 "Been there" note → S17 Empty deck.

1. `GET /api/deck` returns other members' challenges, excluding the member's own
   and anything they already swiped (R-OFF-1, R-OFF-2).
2. For each card the member picks one of: **same boat**, **been there**,
   **follow the trend**, or **skip** (R-OFF-3).
3. "Been there" opens **S11** (`/offer/:challengeId/note`) and requires a note
   **longer than 30 characters** (`limits.beenThereNoteMinChars`) describing what
   they can share, with a counter on the field (R-OFF-4, R-CFG-2).
4. `POST /api/swipe` records the swipe; for **same boat** and **been there** it
   also creates a pending connection request → **F7** (R-OFF-3).
5. Next card advances automatically.

**Branches**

- _Deck empty / exhausted_ → **S17** (`/offer/done`) summarizes the session and
  points at Ask for help (R-OFF-5).
- _One more swipe on the empty state_ → the **"Trend 0 — Trust"** easter egg card
  appears (_from Rules → to Trust · peers: everyone in the room_). It records
  nothing, connects to no one, and dismisses back to the empty state (R-OFF-6).
- _Already swiped that challenge_ → it never reappears in the deck (R-OFF-2).

---

## F7 — Connect (double opt-in) — privacy-critical

**Actors:** requester and target.
**Screens:** S12 Connection request → S13 Request sent → S15 Incoming request
(target side) → S16 Contact exchanged. All of them are screens with URLs, not
modals (R-NAV-2).
**This is the flow the meeting was most explicit about: no contact detail moves
before both sides agree.**

1. Requester triggers Connect (from **F5** step 8 or **F6** step 4) →
   `POST /api/connections` with `{targetId, challengeId?, kind, message?}`.
2. Server creates a **pending** request and notifies the target. **No email
   address is returned to either party** (R-CONN-1, R-CONN-2, R-NFR-1).
3. Requester lands on **S13** — "request sent, waiting for them". No contact
   detail (R-CONN-1).
4. Target sees it in their cockpit (**F8**) and, optionally, by an email that
   deep-links to **S15** `/matches/requests/:id` (R-CONN-2, R-MINE-2, **F13**).
   That email carries the requester's name and note, but no challenge text and
   no address (R-NAV-9).
5. Target chooses:
   - **Accept** → `POST /api/connections/:id/accept`. The request becomes
     accepted and _both_ parties may now read the other's email via
     **S16** (`/matches/requests/:id/contact`), which also offers a prefilled
     `mailto:` (R-CONN-3, R-CONN-6). The requester is told by a badge and by an
     email that deep-links to S16; the badge stays until they open it
     (R-CONN-7, R-MINE-4).
   - **Decline** → `POST /api/connections/:id/decline`. Emails stay private on
     both sides, permanently (R-CONN-4).
6. Both parties continue by email outside the app.

**Branches**

- _Duplicate request_ to the same person for the same challenge → blocked, the
  existing request is surfaced instead: `409` with its id (R-CONN-5).
- _Contact read while still pending or declined, or by a third party_ → `404`,
  not found rather than forbidden, so the request's existence is not confirmed
  (ADR 0004, R-NAV-8). Authorization is checked on every contact read (R-CONN-6,
  R-NFR-1, design §8).
- _Target never responds_ → the request simply stays pending; nothing is
  revealed.
- _Already connected_ → when the two already share an accepted request, the new
  one is accepted at once and the requester lands on **S16**, the new request
  on top of what they are connected over; the target is told by a badge and an
  email linking to S16 (R-CONN-8,9,10). About a challenge they are already
  connected over, nothing is added and the requester lands on S16 all the same.
- _Several requests pending between the two_ → accepting one accepts them all,
  either side; they show on S16 as what the two are connected over, and the
  requester is told once (R-CONN-11).

---

## F8 — Matches cockpit

**Screens:** S14 Matches cockpit.

1. Member opens Matches from the bottom nav.
2. Screen shows: their own challenge(s) with same-boat / been-there counts
   (R-MINE-1), **incoming requests** with Accept / Decline (R-MINE-2 → **F7**
   step 5), their connections, each member once, those with something new on
   top, outlined and counted (R-MINE-5,6), and their followed trends
   (R-MINE-3).
3. The nav badge reflects the number of pending incoming requests and of
   connections accepted that the member has not opened yet (R-MINE-4,
   R-CONN-7,9).

---

## F9 — Follow a trend

1. From a match card, the trend sheet, or the cockpit, the member taps Follow →
   `POST /api/follows/:trendId`; unfollow → `DELETE` (R-ASK-9).
2. Followed trends are listed in the cockpit (**F8**, R-MINE-3).

---

## F10 — Admin: approve applicants

**Actor:** admin member — at the summit, usually the host with a phone in hand.
**Screens:** S19 Admin approvals.

1. Admin opens the approvals screen → `GET /api/admin/applicants`. Each row
   carries the email, when they asked, and any name or organization they gave,
   so the host can match a row to a person in the room (R-AUTH-11).
2. Per applicant: **Approve** → `POST /api/admin/applicants/:id/approve` sets
   `status='active'`, grants the `member` role, **and emails them a magic link
   straight away** — they do not have to come back to the login screen
   (R-AUTH-3, R-AUTH-10). **Reject** → `POST /api/admin/applicants/:id/reject`
   blocks login (R-AUTH-3).
3. Admin may also pre-whitelist addresses in bulk → `POST /api/admin/whitelist`
   (R-AUTH-1) — the normal pre-summit path for invited attendees. A new address
   is not emailed; it signs in on arrival (F1) and onboards (F2). A pending
   applicant on the list is admitted exactly as by **Approve**, sign-in email
   included; a rejected one is kept out and reported, since re-admitting is a
   deliberate, per-person decision (R-AUTH-3).

**Branches**

- _Approving during a break_ → the link is in their inbox before the
  conversation ends, which is the whole point of R-AUTH-10.
- _Rejected applicant tries again_ → the login screen tells them plainly that
  their request was not approved; no link is sent and nobody is notified
  (R-AUTH-13). Re-admitting them is a deliberate admin action (R-AUTH-3).

---

## F11 — GDPR deletion

1. A member deletes their own account on the profile screen (S24) after one
   confirmation, which calls `DELETE /api/profile` and signs them out
   (R-PROF-2). Or they ask the host to remove them.
2. Asked, the admin finds them on `/admin/members` (S23), opens their page
   (S26) and confirms the delete, which calls `DELETE /api/admin/members/:id`.
3. Either way the account is deactivated at once and hidden from everyone, and
   erased 30 days later by the sweep (ADR 0032). Until then:
   - if they deleted it themselves, the member asks for a sign-in link; the
     screen answers as for any member, and the email says the account is set
     to be deleted and carries a link to keep it, which restores it and signs
     them in (a host's deletion sends nothing);
   - or a host restores it on the member's page;
   - or, when the person insists, a host erases it at once there.
4. The erasure deletes the member together with their challenges, connection requests, swipes, follows, role
   grants, sessions and outbound log entries, in one transaction (R-NFR-7,
   R-MSG-6).

- _The member created invites_ → refused with 409 `created_invites`; a poster
  batch outlives its admin, so the invites are dealt with first (R-INV-8).
- _The member is the only admin_ → refused with 409 `last_admin`, as for
  revoking the role (R-ROLE-9).

---

## F12 — Feedback

1. From the app chrome the member taps Feedback, which opens a prefilled
   `mailto:` to the team (R-FB-1). No in-app ticketing in the beta.

---

## F13 — Deep link into a screen (from an email, QR, or shared URL)

**Why:** a connection-request notification should land on the request, not on the
front door (R-NAV-1..10).

1. Member taps a link such as `/matches/requests/abc123` (from the notification
   email in **F7** step 4), or `/challenges/:id/matches` shared with them.
2. **Signed in, onboarded, authorized** → the screen renders directly. Reload and
   browser-back keep working (R-NAV-1).
3. **Signed out** → the app remembers the path, shows **S1 Login**, and passes it
   as `next` to `POST /auth/request-link`. The token carries it, and after
   signing in on **S2** the member lands on the originally requested screen, not
   on welcome (R-NAV-5).
4. **Not onboarded yet** → **F2** runs first, then the member continues to the
   target (R-NAV-7).

**Branches**

- _`next` is an absolute or external URL, or an unknown route_ → ignored, member
  goes to `/` (R-NAV-6). No open redirect.
- _Member is not a party to the linked challenge or request_ → generic
  not-found; the app does not confirm the row exists (R-NAV-8).
- _Link forwarded to someone else_ → it is just a URL; it grants nothing. The
  recipient still needs their own session, and the authorization check in the
  branch above applies.

---

## F14 — Admin: the outbound message log

**Actor:** admin — the host asking "did that actually go out?", or a developer
signing in without a mailbox.
**Screens:** S20 Outbound message log.
**Exists in every environment** (R-MSG-5). Outbound email is otherwise a black
box: you cannot look in someone else's inbox.

1. Every message the system sends is recorded **before** it is handed to the
   transport, with the recipient, type, subject and status (R-MSG-1, R-MSG-2).
2. Admin opens **S20** `/admin/outbox` → the log newest first, filterable by
   recipient and status, with timestamps and any transport error. Guarded by the
   `outbox:read` permission, not by environment (R-MSG-5).
3. Status answers the question that matters: `sent` (the transport took it),
   `failed` (it refused, with the reason), `suppressed` (we deliberately did not
   send), or `recorded` (written, not yet attempted) — R-MSG-3.
4. **Production shows no credential.** The magic-link token is redacted from the
   stored body before writing, so the log proves a link was sent without being a
   way to use it (R-MSG-4).

### In development

5. **Mail never leaves the machine** (`mail.delivery=none`, R-DEV-1). Records are
   written with status `suppressed`.
6. Here — and only here — the stored body keeps the link intact and clickable, so
   a developer signs in as any seeded member from this screen. Clicking completes
   **F1** from step 6, `next` path included, so deep links (**F13**) are testable
   the same way.
7. **The first sign-in comes from the terminal.** This screen needs
   `outbox:read`, so it cannot let anyone in the first time. `npm run dev` prints
   a magic link for the seeded admin (`admin@rebel-match.invalid`); clicking it
   is F1 from step 6. `npm run dev:login <email>` prints one for any other seeded
   member (R-DEV-6).

**Branches**

- _A member says the link never arrived_ → the log distinguishes "we never sent
  it" from "the transport refused it" from "it went out and the inbox swallowed
  it". That third case is the one that sends you to the DMARC records rather than
  to the code (R-NFR-3).
- _Entries age past retention_ → the server purges them automatically, at startup
  and then hourly by default; the window is configurable because the log holds
  email addresses (R-MSG-6). There is no manual purge.
- _A member is erased_ → their log entries go with them, in the same transaction
  (R-NFR-7).
- _Production started with delivery off_ → it does not start. Recording links
  while sending none means nobody can log in, so it fails at boot (R-DEV-5).

---

## F15 — Join through an invite link (QR auto-approval)

**Actor:** someone in the room who is not on the whitelist, scanning the summit
QR code. **This is the flow that makes R-NFR-3 reachable for them** — without it
they wait for a human (**F4**).
**Screens:** S1 Login → S3 Onboarding. No applicant queue, no admin step.

1. The QR encodes the app root with an invite token, `/?invite=…` (R-NAV-10). The
   client keeps the token while routing to **S1**.
2. **S1** MAY confirm the invite was recognized — "joining via Summit 2026" — so
   the scanner knows the code worked before typing anything. The token itself is
   never shown (R-INV-12).
3. They enter their email → `POST /auth/request-link` with `{email, invite}`.
4. Server checks the token is **usable**: not revoked, inside its window, and
   under its cap (R-INV-2,3,4).
5. Usable → the member is created **active** with the `member` role,
   `joined_via_invite_id` is recorded, `uses` increments, and the magic link is
   emailed immediately (R-INV-1, R-INV-7, R-INV-8). From here it is **F1** from
   step 6: open the link, then **F2**.
6. **F2 still runs in full.** Auto-approval skips the admin, never the consent
   (R-INV-6).

**Branches**

- _Token unknown, expired, not yet valid, revoked, or at its cap_ → the request
  continues as an ordinary one: recorded as an applicant, admin notified, and they
  land on **S21** (`/access-requested?invite=invalid`) with a notice at the top —
  _"this invitation link isn't valid right now"_ — above the usual message that
  someone will approve them and the email will carry their link. One wording for
  every case, since the next step is the same; never an error dead end, because
  the QR is printed and the person is holding a phone (R-INV-5, **F4**).
- _Scanner is already whitelisted_ → ordinary **F1**; the invite is ignored and no
  use is consumed.
- _Scanner already has an account_ → ordinary **F1** login. No new member, so
  `uses` does not increment and a typo cannot burn a seat.
- _Link escapes the room_ (photographed, shared, posted) → this is expected, not a
  breach: the window, the cap and revocation are the controls. A host who sees
  unexpected signups revokes the invite in **F16**, and the next scan falls to
  **F4**.

---

## F16 — Admin: invite links

**Actor:** admin, usually the host setting up before a session.
**Screens:** S22 Admin invites.

1. Admin opens `/admin/invites` → `GET /api/admin/invites`: every invite with
   its label, window, uses against cap, creator, and state — active, scheduled,
   expired, revoked, or exhausted (R-INV-9).
2. **Create** → `POST /api/admin/invites` with a label, a validity window, and a
   use cap. The response carries the join URL once, so the host can render the
   QR for a badge, a slide, or a poster (R-INV-9, R-INV-10).
3. **Revoke** → `POST /api/admin/invites/:id/revoke`. Effective on the next use,
   with no cache in the way (R-INV-3). The printed code keeps existing; it
   simply stops admitting anyone.
4. Who joined through which invite is recorded, so a bad batch can be found and
   deleted afterwards (R-INV-8, **F11**).

**Branches**

- _Window ends mid-session_ → the invite goes inert on its own; scans fall to
  **F4**. Extending means creating a new invite, which is deliberate: an invite's
  window is a promise, not a setting to nudge.
- _Cap reached, or close to it, with people still queuing_ → the host raises
  the invite's cap on the invite screen, and the printed code keeps admitting.
  Stragglers who already fell to **F4** are approved through **F10**.

---

Each flow emits events under a **pseudonymous** member id, and never carries
challenge text, names, or email addresses (R-ANA-1, R-ANA-2, R-ANA-3). Capture is
gated on the **separate analytics opt-in** ticked in **F2**, never on the
data-usage consent itself (R-ANA-4, ADR 0026), so a member who leaves the box
unticked is never counted. Mixpanel therefore cannot see the first F1 → F2 run:
nobody has opted in before onboarding. The event that finishes **F2** carries
`seconds_to_onboard`, from the sign-in email to the consent, for a whitelisted
attendee and an invite joiner alike, so Mixpanel watches the part of the
2-minute budget of R-NFR-3 the server can see, across everyone who ticks the
box. The part before the email, from the scan to typing the address, happens in
a browser the app stores nothing in before consent, so the whole path is timed
by hand on a phone (tasks.md, M6). The database keeps no sign-in tokens for it: used
and expired ones are purged (ADR 0034).
