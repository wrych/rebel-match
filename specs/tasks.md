# Rebel Match — Implementation Plan

Milestones toward the beta. Hard dates from the meeting:

- **2026-11-01** — feature-complete and tested (one week before the summit).
- **2026-11-08** — summit launch (QR codes, used during breaks).
- **~2026-11-15** — Ivo unavailable after this; keep critical work before it.

Each task cites the requirement (`R-*`) and priority (`M/S/C`) it serves.
User journeys are in `flows.md` (`F1`…`F14`).

---

## M0 — Foundation _(M10..M14 groundwork)_

- [x] `package.json` + **TypeScript strict** (`tsconfig.json`, `tsc --noEmit`).
      _(ADR 0011)_
- [x] Node + Express skeleton wired to the pool and config, with a health check
      that reports the database rather than refusing to start. _(design §1)_
- [x] `GET /api/config` exposing the client-relevant subset. _(R-CFG-2)_
- [x] Migration runner: forward-only, ordered, idempotent, and it refuses to run
      when a migration that already ran has been edited. _(R-QA-4, constitution §6)_
- [x] Migrations for the login journey — `members`, `roles`, `member_roles`,
      `magic_tokens`, `invites`, `outbox`, `sessions`. The remaining tables land
      with the journeys that use them. _(R-ROLE-1,6, R-DEV-1, R-MSG-1, R-INV-8)_
- [x] `mysql2` pool, and CI gains the MySQL service plus `migrate` and
      integration steps. _(design §1, R-QA-2,4)_
- [x] Permission middleware `requirePermission(...)` + role resolver (union of
      roles, no role-name checks anywhere). _(R-ROLE-2,3,5)_
- [x] Permissions renamed `resource:action` and read through a
      `PermissionPolicy`. _(R-ROLE-10, ADR 0021)_
- [x] Grant and revoke roles: `POST /api/admin/members/:id/roles`,
      `DELETE /api/admin/members/:id/roles/:role`, refusing to remove the last
      holder of `role:grant`. _(R-ROLE-7,9)_
- [x] Seed runner with `SEED_PROFILE`, dev-in-prod guard, idempotent upserts;
      roles, the dev roster and the dev admin. _(R-SEED-1,2,4,7, R-DEV-6)_
- [x] Seed trends, cases and the dev challenges and notes, with the tables
      they need (M2). _(R-SEED-1,2)_
- [x] Vue 3 + Vite + vue-router scaffold; the shared route table in
      `src/routes.ts` with `safeNextPath` for the server validator; login and
      not-found screens. _(R-NAV-1,6, ADR 0017)_
- [x] Client test setup: `@vue/test-utils` + jsdom. _(R-QA-1, ADR 0017)_
- [x] Boundary schemas (`zod`) on every write route. The error handler that
      leaks nothing is in place. _(R-CFG-3, constitution §5)_
- [x] Vitest harness: `npm test` + `npm run test:integration` (disposable
      Postgres or PGlite, `mail.delivery=none`). _(R-QA-1,2)_
- [x] ESLint + Prettier with the mechanical constitution rules
      (`import/no-cycle`, `complexity`, `no-console`, `no-warning-comments`).
      _(constitution §9)_
- [x] commitlint + pre-commit/commit-msg hooks (format and lint on staged files,
      full typecheck). _(ADR 0012, constitution §9)_
- [x] GitHub Actions CI: install, lint, typecheck, commitlint, unit, migrate
      from scratch, integration, build; synthetic env only, coverage floor
      enforced. _(R-QA-3,4,5)_
- [x] Branch protection on `main`: PR required, CI green required, squash-only.
      _(ADR 0012, R-QA-6)_

## M1 — Auth & onboarding _(M1, M2 — gates everything, F1 + F2)_

Order matters here, and one dependency is easy to miss: **in development nothing
is emailed**, so the outbound message log is the only way to retrieve your own
magic link (F14). It cannot be deferred past login.

The path to a login you can time on a phone: the auth seam, then the mailer and
log, then the routes and admission policy, then the screens and a dev seed.

The path to a developer signing in as admin, which comes first: the seed runner
with the dev admin, the mailer, `/auth/verify` with the session routes, then the
printed dev link (R-DEV-6).

- [x] `auth` module behind its seam: `issueLink` / `verifyToken` /
      `createSession` / `currentMember` / `endSession`, injected everywhere, with
      a fake for tests. No token or cookie knowledge outside it. _(ADR 0015)_
- [x] Printed dev sign-in link: `npm run dev` for the seeded admin,
      `npm run dev:login <email>` for any seeded member, refused outside a
      development deployment with delivery off and the dev seed. _(R-DEV-6)_
- [x] `POST /auth/request-link`: whitelist check, token create, send link,
      accepts `next`; unknown email → applicant + admin notice.
      _(R-AUTH-1,2,4, R-NAV-5)_
- [x] Live login form, and the access-requested screen (`/access-requested`)
      with the "we will email you a login link once approved" copy and optional
      name/org → `POST /auth/applicant`, keyed by a signed handle.
      _(R-AUTH-9,11,12,13)_
- [x] Approval sends a magic link immediately, with the 24 h approval TTL and the
      `kind` column on tokens. _(R-AUTH-3,10)_
- [x] Invite redemption: `/?invite=…` carried to login, usability check (window,
      cap, revoked), auto-approve + `joined_via_invite_id` + `uses`, fallback to
      the applicant flow with the invalid-invite notice on the access-requested
      screen. _(R-INV-1..8, F15)_ The `invite_rejected` analytics event is not
      captured (ADR 0026); the optional "joining via …" recognition (R-INV-12) is not
      built.
- [x] Admin invite screen (`/admin/invites`): list with state, create with label /
      window / cap, revoke, show the join URL for the QR. _(R-INV-9,10, F16)_
- [x] `GET /auth/verify`: validate/consume token, issue session, redirect to the
      validated `next` or onward. _(R-AUTH-5,6, R-NAV-5,6)_
- [x] Persistent session cookie + `/auth/me` (incl. `roles[]` + `permissions[]`) + `/auth/logout`. _(R-AUTH-7,8, R-ROLE-4)_
- [x] Mailer that always records to the outbound log, then delivers per
      `mail.delivery`; token redacted outside development.
      _(design §1, R-MSG-1,2,3,4, R-DEV-1,4)_
- [x] `GET /api/admin/outbox`, permission-gated in every environment, filter by
      recipient and status; retention purged by a server job, not an endpoint.
      _(R-MSG-5,6)_
- [x] Outbound message log screen (`/admin/outbox`). _(R-MSG-5, F14)_
- [ ] Verify magic-link deliverability to a phone inbox (<30 s, not spam);
      confirm from-address + SPF/DKIM; check the outbound log distinguishes sent
      from failed. _(R-NFR-3, R-MSG-3, open question 4)_
- [x] Onboarding screen + `POST /api/onboarding` (name, optional job title,
      consent version/ts). _(R-ONB-1..4, R-ROLE-8)_
- [x] Consent copy wired in: email-sharing on connect + membership by invitation.
      Draft wording in `src/consent.ts` until open question 1 names its owner.
      _(R-ONB-5)_
- [x] Route guard: active + onboarded required for `/api/*`; deep links land on
      onboarding first. _(R-NAV-7)_

## DB — Postgres through Drizzle _(ADR 0024)_

- [x] Drizzle schema for every table and a Postgres baseline migration that
      replaces the MySQL ones; the runner keeps its forward-only rules.
      _(R-QA-4, constitution §6)_
- [x] Every store on Drizzle, with the integration suite green on PGlite; the
      duplicate-request guard becomes a partial unique index. _(R-QA-2, R-CONN-5)_
- [x] With `DATABASE_URL` unset, the server opens PGlite in `.data/pglite` and
      generates a `SESSION_SECRET` into `.data`; production refuses to start
      without both. _(R-CFG-1, R-NFR-5)_
- [x] CI: a Postgres 17 service for `migrate` and the integration suite, and the
      MySQL service, `compose.yaml` and `mysql2` removed. _(R-QA-2,4)_ The
      suite also runs on PGlite in CI and on every push; `compose.yaml` offers
      an optional Postgres 17.

## M2 — Ask journey _(M3 → M4 → M5, F5)_

- [x] Submit screen: textarea, read-only example hints (no insert action), >30-char gate from config + counter. _(R-ASK-1,2,3, R-CFG-1,2)_
- [x] `POST /api/challenges` + matcher service (keyword scorer §5). _(R-ASK-4,5)_
- [x] Domain screen (`/challenges/:id`) + separate trend-picker **screen**
      (`/challenges/:id/trend`).
      _(R-ASK-6,7, R-NAV-2)_
- [x] `GET /api/challenges/:id/matches`: same boat / been there / cases (no
      emails). _(R-ASK-8)_
- [x] Matches screen with Follow + Connect; trend detail / case studies as its
      own screen (`/trends/:trendId`). _(R-ASK-9,10, R-NAV-2)_
- [x] Matches screen says posting worked and what it is for: posted banner,
      people-first section headings, empty sections that point onward.
      _(R-ASK-11,12,13)_

## M3 — Offer journey _(M6, F6)_

- [x] `GET /api/deck`: next challenges, exclude own + already-swiped. _(R-OFF-1,2)_
- [x] Swipe UI: same boat / been there / follow / skip. _(R-OFF-3)_
- [x] "Been there" note as its own screen, >30 chars from config + counter.
      _(R-OFF-4, R-CFG-1,2, R-NAV-2)_
- [x] `POST /api/swipe` records swipe and, for same boat/been there, creates a
      connection request. _(R-OFF-3)_
- [x] Empty-deck screen with session summary. _(R-OFF-5)_
- [x] 🥚 "Trend 0 — Trust" easter egg on the empty deck: cosmetic only, records
      nothing, dismissible, keyboard-reachable. _(R-OFF-6)_

## M4 — Connecting (double opt-in) _(M7 → M8 — privacy-critical, F7)_

- [x] Connection-request **screen** + `POST /api/connections`: pending request,
      notify target, no email. _(R-CONN-1,2, R-NAV-2)_ The target is told
      through the incoming list until the M5 email lands.
- [x] Cockpit incoming list + incoming-request screen with accept/decline.
      _(R-MINE-2, R-CONN-3,4, R-NAV-2)_
- [x] Contact screen + `GET /api/connections/:id/contact`: email + mailto only
      when accepted and caller is a party. _(R-CONN-3,6)_
- [x] Duplicate-request guard. _(R-CONN-5)_
- [x] Cockpit: my challenge(s) + counts, followed trends, nav badge. _(R-MINE-1,3,4)_
      The bottom bar has Submit and Matches; Swipe joins with the Offer screen.
- [x] Already connected: a further request is accepted at once and the target
      told; one card per member in the cockpit, new ones first, outlined and
      counted; the contact screen lists what the two are connected over.
      _(R-CONN-8,9,10, R-MINE-5,6, ADR 0035)_
- [x] Accepting one request accepts every other one pending between the two.
      _(R-CONN-11)_

## M5 — Supporting features _(Should-haves)_

- [x] Admin approvals screen + `/admin/applicants/*`, permission-guarded.
      _(S19, R-AUTH-3,11, R-ROLE-3)_
- [x] Whitelist add (`POST /api/admin/whitelist`), permission-guarded.
      _(R-AUTH-1, R-ROLE-3)_
- [x] Follow endpoints + UI. _(S2, R-ASK-9)_ The endpoints are in, and the
      matches and trend screens follow and unfollow.
- [x] Analytics opt-in: the unticked onboarding checkbox with its versioned
      words, `analytics_consent_*` on members, `PUT /api/me/analytics` and the
      welcome-screen toggle. _(R-ANA-4, ADR 0026)_
- [x] Header menu in place of the "CR" mark: colour mode, Profile & privacy,
      host tools by permission, sign out; host tools and sign out leave the
      welcome screen. _(R-PROF-3, R-LOOK-2, R-ROLE-4)_
- [x] Profile & privacy screen (`/profile`, S24) with `GET`/`PUT /api/profile`:
      edit name, job title, organization; the accepted consent read-only; the
      analytics toggle, moved off the welcome screen, with its words reworded
      (a new analytics version) to point at the profile screen; how to leave.
      _(R-PROF-1,2, R-ANA-4)_
- [x] Sector and company size picked from fixed lists at onboarding and on
      the profile screen, shown on cards as "_n_ employees". _(R-ONB-2,
      R-PROF-1, R-OFF-2)_
- [x] Mixpanel sending from the server only (**EU endpoint**, project created
      with EU residency), pseudonymous id, the event set from design §7 with
      `POST /api/events` for the two UI events, opted-in members only.
      _(S3, R-ANA-1..3,5, ADR 0026)_
- [x] Email notification on incoming connection request, deep-linking to
      `/matches/requests/:id` with no challenge text or contact detail.
      _(S4, R-CONN-2, R-NAV-9)_
- [x] Feedback mailto. _(S5, R-FB-1)_ To `FEEDBACK_TO`, required in production.
- [x] Admin GDPR delete: member plus challenges, requests, swipes, follows, role
      grants and outbound log entries, in one transaction. _(R-NFR-7, R-MSG-6)_
- [x] Member cards in the host tools, and a member's page with roles and
      delete. _(R-MEM-1,2)_
- [x] Select several members by holding a card; give or take a role, or delete
      them. _(R-MEM-3)_
- [x] Delete your own account from the profile screen. _(R-PROF-2, C4)_
- [x] Erasure waits 30 days: deactivate now, undo by emailed link or host,
      sweep after the grace period. _(R-NFR-7, ADR 0032)_

## M6 — Hardening & pilot _(by 2026-11-01)_

- [ ] Mobile-first pass on every screen (portrait phone). _(R-NFR-2)_
- [x] Abuse limits on sign-in: per address, a per-IP backstop, and the
      self-hosted ALTCHA check for new applicants past the per-IP cap; client
      IP through `TRUST_PROXY`. _(R-NFR-8, ADR 0029)_
- [x] Admin view of the configuration in the host tools, read-only and
      grouped. _(R-CFG-5)_
- [x] Hosts change the spam-protection numbers, invite defaults and minimum
      lengths from the settings screen, stored in the database. _(R-CFG-6,
      ADR 0031)_
- [x] Rate-limit auth, verify token hashing, session flags, permission + party
      checks on every read. _(R-NFR-5, R-ROLE-5, design §8)_
- [ ] Resolve the caller once per request: `guardApi` keeps the `MemberRef`
      and profile it already reads in `response.locals`; `requirePermission`
      and `requireSession` read them there and ask the seam only where
      `guardApi` does not run (`/auth/*`). Today a guarded `/api` request
      resolves the same cookie three times (`renewSessions`, `guardApi`,
      `requirePermission`), five or six queries before the handler. Refactor
      only: behaviour and tests unchanged, one pull request. _(R-ROLE-5,
      R-NAV-7, constitution §4, design §8)_
- [ ] Structured, PII-safe error logging: one logger module (the only place
      `no-console` lets write) injected through `AppDeps`; `handleErrors` logs
      the error with a request id and returns the id in the 500 body; the
      server's `onError` hooks log through it; the email-address redaction of
      an error message is unit-tested. _(R-NFR-9)_
- [x] Security headers through `helmet`, with a CSP the human-check widget is
      checked against. _(ADR 0034)_
- [x] Production refuses an http `PUBLIC_URL` or `TRUST_PROXY=0`. _(ADR 0034)_
- [x] Signing in rotates the session; expired sessions and tokens are purged;
      the legacy `GET /auth/verify` is removed. _(ADR 0034)_
- [ ] Production seed: attendee whitelist + the ~15 real collected challenges
      from env-pointed private files; admins granted the `admin` role.
      _(S6, R-SEED-3,5,6)_
- [x] The seed runner refuses the prod profile in a development deployment, so
      no real address reaches a preview or staging. _(R-SEED-8)_
- [x] Deploy non-prod from GitHub to Cloud Run: a preview per pull request and
      staging from `main`. _(ADR 0025, rollout step 1)_
- [ ] Production on Cloud Run, promoted from staging by a reviewed workflow,
      in time for the pilot. _(ADR 0025, rollout step 2)_
- [ ] Uptime check and alerts on production: a Cloud Monitoring uptime check
      on `/api/health` expecting `"database":"up"`, alert policies on the 5xx
      share and on failed job executions, a notification channel reaching the
      hosts' phones; added to `docs/cloud-setup.md` part 2 as a numbered step
      and done once on staging first. _(R-NFR-10, ADR 0025)_
- [ ] Decide and implement challenge attribution for the production seed.
      _(open question 5)_
- [ ] Deep-link pass: every email/QR target opens correctly signed out, signed
      in, and un-onboarded; `next` validation rejects external URLs.
      _(R-NAV-5,6,7, F13)_
- [ ] Invite-link dry run: create one, scan it on a phone as an unknown address,
      revoke it, confirm the next scan shows the invalid-invite notice and lands
      on the access-requested screen. _(R-INV-3,5)_
- [x] `onboarding_completed` carries `seconds_to_onboard`, from the sign-in
      email to the consent, so R-NFR-3 is watched in Mixpanel. _(R-NFR-3)_
- [ ] Raise an invite's cap from its card on the invite links screen.
      _(R-INV-4, R-INV-9)_
- [ ] QR-code entry flow validated end-to-end on a phone; time scan → onboarding
      complete (<2 min). _(R-NFR-3)_
- [ ] CI green on `main`. _(R-QA-6)_
- [ ] Pilot test with 2–3 people; fix blockers. _(Meeting: "ready means we tested
      it… with a couple of people.")_
- [ ] Record deck views and offer deleting one's activity history, with the
      consent words that say so. _(R-STAT-1..5, ADR 0033)_
- [ ] Notifications in the app: the `notifications` table, written with each
      connection request, new connection and applicant; `/notifications`; the
      menu's badge and "Notifications (n new)". Mail still goes as today.
      _(R-NOTE-1,4,5,6, R-PROF-3, ADR 0037)_
- [ ] Mail notifications through the worker, every type _Immediately_; a
      request stands when its mail fails, so `notifyOrWithdraw` goes.
      _(R-NOTE-9,10,11, ADR 0037)_
- [ ] Cadences: _Every 15 minutes_, _Hourly_, _Daily_, _In the app only_ and
      _Off_ per type on the profile screen, with the defaults; the digest mail
      and `outbox_quotes`. _(R-NOTE-2,3,7,8, R-MSG-6)_
- [ ] Notify followers of a new challenge in their trend, linking to the deck
      opened at its card. _(R-ASK-9, R-NOTE-1, R-OFF-7)_

## Post-beta backlog _(Could / Won't-for-now)_

- [ ] Decide how activity statistics are displayed — end-of-event figures
      (challenges and their authors, views, "been there" notes) and a host
      dashboard — including a minimum count below which a figure is not shown,
      since a small number can point to a person. _(R-STAT-2, ADR 0033)_
- [ ] LLM trend classifier replacing keywords (same interface). _(C5)_
- [ ] `moderator` role + moderation screens — a role row plus a permission-matrix
      column, no schema change. _(C2, R-ROLE-6)_
- [ ] Live peer counts per trend. _(C3)_
- [ ] Dark mode as a further colour mode: a third token block, possibly
      following the phone's own setting. _(C7, R-LOOK-3, ADR 0023)_
- [ ] (Deferred) gamification, frontier nomination, platform integration,
      phone/LinkedIn connect. _(W1, W3–W7)_

---

## Definition of done (beta)

1. A whitelisted member can: scan the QR code → magic-link in → onboard (name +
   consent) in **under 2 minutes** → submit a challenge → see it matched to a
   trend → see same boat / been there / cases.
2. A member can swipe others' challenges and request to connect.
3. A connection exchanges emails **only after both opt in**.
4. Works on a phone from a QR code, and an emailed link opens the right screen.
5. Usage is visible in Mixpanel (EU project) without any PII leaving the app.
6. A dev deployment sends no email; magic links are read from the admin outbox.
7. Production contains no fictional seed data.
8. Unit + integration tests pass and GitHub Actions is green on `main`.
9. Tested with a small pilot group before 2026-11-01.
