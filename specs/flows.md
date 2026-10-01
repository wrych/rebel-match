# Rebel Match — User Flows

Every journey through the beta, written out step by step. This is the connective
tissue between [`requirements.md`](requirements.md) (what must be true) and
[`design.md`](design.md) (screens §4, API §3): each flow names the screens it
touches, the endpoints it calls, and the requirements it satisfies.

Conventions:

- **Happy path** is the numbered list. **Branches** cover alternates and errors.
- Screen numbers (`S1`…`S20`) refer to `design.md` §4.
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
       │      └──(unknown email)──►  F4 Request access ──►  F10 Admin approval
       ▼
   F2 First-time onboarding (name + consent)   ◄── R-NFR-3 budget ends here
       │
       ▼
   F3 Welcome — two doors   (or straight on to the deep-linked screen)
       ├──►  F5 Ask for help  ──►  F7 Connect (double opt-in)
       └──►  F6 Offer help    ──►  F7 Connect (double opt-in)
                   │
                   ▼
            F8 Matches cockpit  ──►  F7 (accept / decline)
                   ├──►  F9 Follow a trend
                   └──►  F12 Feedback

   Admin only: F10 Approvals · F11 GDPR deletion · F14 Dev outbox (dev only)
   Admin-only: F10 Approvals · F11 GDPR deletion · F14 Dev outbox (dev only)

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
5. S1 switches to a "check your email" state. Response is always 200, so the
   screen never reveals whether the address is known (no email enumeration).
6. Member opens the email on the same phone and taps the link →
   `GET /auth/verify?token=…`.
7. Server validates and consumes the token, creates a signed http-only session
   cookie that survives closing the browser (R-AUTH-5, R-AUTH-7, R-NFR-5).
8. **S2** routes onward: no profile name yet → **F2**; otherwise → **F3**.

**Branches**

- *Email not on the whitelist* → **F4** (member still sees the same "check your
  email" state; only the admin is notified).
- *Link expired, already used, or unknown* → error screen with a "send me a new
  link" action, returning to step 3 (R-AUTH-6).
- *Email is slow to arrive* → the "check your email" state offers resend after a
  short delay. Delivery is inside the R-NFR-3 budget and should land within 30 s.
- *Member already has a valid session* (returning during the same summit) → skip
  to **F3**; this is the common case after the first break (R-AUTH-7).
- *Rate limiting* — repeated link requests for the same address are throttled
  (design §8) without changing the on-screen state.

---

## F2 — First-time onboarding (name + consent)

**Actor:** authenticated member with no profile yet.
**Screens:** S3 Onboarding.
**Ends the R-NFR-3 measurement.**

1. Any authenticated route detects a missing profile name and forces **S3**
   before anything else (R-ONB-1).
2. Member enters their **display name** (required); role / organization are
   optional and only feed the match cards (R-ONB-2).
3. Member reads the data-usage consent, which states plainly that **email
   addresses are shared only when both sides accept a connection**, and that the
   app is closed to whitelisted members (R-ONB-5).
4. Member ticks explicit acceptance and submits → `POST /api/onboarding` with
   `{name, role?, org?, consentVersion}`.
5. Server stores the profile plus the consent version and timestamp (R-ONB-3,
   R-NFR-6). **Stopwatch for R-NFR-3 stops here.**
6. Member lands on **F3**.

**Branches**

- *Name empty* → submit stays disabled.
- *Consent not accepted* → submit stays disabled; the app remains blocked
  (R-ONB-4).
- *Consent version has since changed* → on a later visit the consent is
  re-presented and must be re-accepted before the app opens again (R-ONB-4).

---

## F3 — Welcome: two doors

**Screens:** S4 Welcome.

1. Member sees two choices: **Ask for help** → **F5**, **Offer help** → **F6**.
2. Bottom navigation also reaches the **Matches cockpit** (**F8**), with a badge
   when requests are pending (R-MINE-4).

---

## F4 — Request access (not yet whitelisted)

**Actor:** someone who heard about the app but was not invited.

1. They submit an email on **S1** that is not on the whitelist.
2. Server records a pending **applicant** and notifies an admin — no token, no
   session (R-AUTH-2).
3. The screen shows the same neutral "check your email" state.
4. An admin resolves it in **F10**. On approval the applicant can request a
   working link via **F1**; on rejection they cannot log in and no challenge data
   is kept for them (R-AUTH-3).

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
7. **S8** shows `GET /api/challenges/:id/matches`: **same boat** peers, **been
   there** peers, and curated **case studies** for the trend — names and roles
   only, never email addresses (R-ASK-8, R-NFR-1).
8. From a match card the member can **Follow** the trend (**F9**) or **Connect**,
   which opens **F7** — not a `mailto:` (R-ASK-9, R-ASK-10).

**Branches**

- *No peers yet* (early at the summit) → the case studies still render, so the
  screen is never empty.
- *Matcher finds no keyword hit* → fall back to the lowest-confidence trend and
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

- *Deck empty / exhausted* → **S17** (`/offer/done`) summarizes the session and
  points at Ask for help (R-OFF-5).
- *One more swipe on the empty state* → the **"Trend 0 — Trust"** easter egg card
  appears (*from Rules → to Trust · peers: everyone in the room*). It records
  nothing, connects to no one, and dismisses back to the empty state (R-OFF-6).
- *Already swiped that challenge* → it never reappears in the deck (R-OFF-2).

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
   That email carries no challenge text and no address (R-NAV-9).
5. Target chooses:
   - **Accept** → `POST /api/connections/:id/accept`. The request becomes
     accepted and *both* parties may now read the other's email via
     **S16** (`/matches/requests/:id/contact`), which also offers a prefilled
     `mailto:` (R-CONN-3, R-CONN-6).
   - **Decline** → `POST /api/connections/:id/decline`. Emails stay private on
     both sides, permanently (R-CONN-4).
6. Both parties continue by email outside the app.

**Branches**

- *Duplicate request* to the same person for the same challenge → blocked, the
  existing request is surfaced instead (R-CONN-5).
- *Contact read while still pending or declined, or by a third party* → `403`.
  Authorization is checked on every contact read (R-CONN-6, R-NFR-1, design §8).
- *Target never responds* → the request simply stays pending; nothing is
  revealed.

---

## F8 — Matches cockpit

**Screens:** S14 Matches cockpit.

1. Member opens Matches from the bottom nav.
2. Screen shows: their own challenge(s) with same-boat / been-there counts
   (R-MINE-1), **incoming requests** with Accept / Decline (R-MINE-2 → **F7**
   step 5), and their followed trends (R-MINE-3).
3. The nav badge reflects the number of pending incoming requests (R-MINE-4).

---

## F9 — Follow a trend

1. From a match card, the trend sheet, or the cockpit, the member taps Follow →
   `POST /api/follows/:trendId`; unfollow → `DELETE` (R-ASK-9).
2. Followed trends are listed in the cockpit (**F8**, R-MINE-3).

---

## F10 — Admin: approve applicants

**Actor:** admin member.
**Screens:** S19 Admin approvals.

1. Admin opens the approvals screen → `GET /admin/applicants`.
2. Per applicant: **Approve** → `POST /admin/applicants/:id/approve` sets
   `status='active'`, so **F1** now works for them; **Reject** →
   `POST /admin/applicants/:id/reject` blocks login (R-AUTH-3).
3. Admin may also pre-whitelist addresses in bulk → `POST /admin/whitelist`
   (R-AUTH-1) — the normal pre-summit path for invited attendees.

---

## F11 — Admin: GDPR deletion

1. A member asks to be removed (by email; self-service is post-beta).
2. Admin calls `DELETE /admin/members/:id`, which deletes the member together
   with their challenges and connection requests (R-NFR-7).

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
   as `next` to `POST /auth/request-link`. The emailed link carries it through
   `/auth/verify?token=…&next=…`, and after verification the member lands on the
   originally requested screen, not on welcome (R-NAV-5).
4. **Not onboarded yet** → **F2** runs first, then the member continues to the
   target (R-NAV-7).

**Branches**

- *`next` is an absolute or external URL, or an unknown route* → ignored, member
  goes to `/` (R-NAV-6). No open redirect.
- *Member is not a party to the linked challenge or request* → generic
  not-found; the app does not confirm the row exists (R-NAV-8).
- *Link forwarded to someone else* → it is just a URL; it grants nothing. The
  recipient still needs their own session, and the authorization check in the
  branch above applies.

---

## F14 — Dev: logging in without email (admin outbox)

**Only in a development deployment** (`mail.transport=outbox`). Production never
has this screen (R-DEV-3).

1. Developer requests a magic link as any seeded member on **S1**.
2. The mailer writes the message to the `outbox` table instead of sending it —
   **no email leaves the machine** (R-DEV-1).
3. Developer opens **S20 `/admin/outbox`**: captured messages newest first with
   recipient, subject, timestamp, body, and the magic link rendered clickable and
   copyable (R-DEV-2).
4. Clicking the link completes **F1** from step 6 onwards — including any `next`
   path, so deep links (**F13**) can be tested the same way.

**Branches**

- *Outbox requested in production* → not found, so live magic links are never
  browsable (R-DEV-3).
- *Outbox full of old messages* → `DELETE /admin/outbox` clears it.

---

## Analytics touchpoints

Each flow emits events under a **pseudonymous** member id, and never carries
challenge text, names, or email addresses (R-ANA-1, R-ANA-2, R-ANA-3). Capture is
gated on the consent recorded in **F2** (R-ANA-4). The funnel that matters for
R-NFR-3 is F1 → F2: *link requested → link opened → onboarding submitted*, with
timestamps to confirm the 2-minute budget holds on real conference wifi.
