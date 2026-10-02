# Rebel Match — Implementation Plan

Milestones toward the beta. Hard dates from the meeting:

- **2026-11-01** — feature-complete and tested (one week before the summit).
- **2026-11-08** — summit launch (QR codes, used during breaks).
- **~2026-11-15** — Ivo unavailable after this; keep critical work before it.

Each task cites the requirement (`R-*`) and priority (`M/S/C`) it serves.
User journeys are in `flows.md` (`F1`…`F14`).

---

## M0 — Foundation *(M10..M14 groundwork)*

- [ ] `package.json` + **TypeScript strict** (`tsconfig.json`, `tsc --noEmit`).
      *(ADR 0011)*
- [ ] Node + Express skeleton, `mysql2` pool, env-driven `config.ts` with the
      limits/permissions tables. *(design §1, R-CFG-1,4)*
- [ ] `GET /api/config` exposing the client-relevant subset. *(R-CFG-2)*
- [ ] Migrations for all tables in `design.md` §2, including `roles`,
      `member_roles` and `outbox`. *(R-ROLE-1,6, R-DEV-1)*
- [ ] Permission middleware `requirePermission(...)` + role resolver (union of
      roles, no role-name checks anywhere). *(R-ROLE-2,3,5)*
- [ ] Seed runner with `SEED_PROFILE`, dev-in-prod guard, idempotent upserts;
      shared seed = roles + trends + cases. *(R-SEED-1,4,7)*
- [ ] Client router with path-based URLs + SPA catch-all + not-found screen.
      *(R-NAV-1,10)*
- [ ] Health check + boundary schemas (`zod`) + error handling middleware that
      leaks nothing. *(R-CFG-3, constitution §5)*
- [ ] Vitest harness: `npm test` + `npm run test:integration` (supertest,
      disposable MySQL, `mail.transport=outbox`). *(R-QA-1,2)*
- [ ] ESLint + Prettier with the mechanical constitution rules
      (`import/no-cycle`, `complexity`, `no-console`, `no-warning-comments`).
      *(constitution §9)*
- [ ] commitlint + pre-commit/commit-msg hooks (format, lint, typecheck on staged
      files). *(ADR 0012, constitution §9)*
- [ ] GitHub Actions CI: install, lint, typecheck, commitlint, migrate from
      scratch, unit, integration, build; synthetic env only, coverage floor
      enforced. *(R-QA-3,4,5)*
- [ ] Branch protection on `main`: PR required, CI green required, squash-only.
      *(ADR 0012, R-QA-6)*

## M1 — Auth & onboarding *(M1, M2 — gates everything, F1 + F2)*

- [ ] `POST /auth/request-link`: whitelist check, token create, send link,
      accepts `next`; unknown email → applicant + admin notice.
      *(R-AUTH-1,2,4, R-NAV-5)*
- [ ] Access-requested screen (`/access-requested`) with the "we will email you a
      login link once approved" copy + optional name/org → `POST /auth/applicant`.
      *(R-AUTH-9,12)*
- [ ] Approval sends a magic link immediately, with the 24 h approval TTL and the
      `kind` column on tokens. *(R-AUTH-3,10)*
- [ ] Invite redemption: `/?invite=…` carried to login, usability check (window,
      cap, revoked), auto-approve + `joined_via_invite_id` + `uses`, fallback to
      the applicant flow. *(R-INV-1..8, F15)*
- [ ] Admin invite screen (`/admin/invites`): list with state, create with label /
      window / cap, revoke, show the join URL for the QR. *(R-INV-9,10, F16)*
- [ ] `GET /auth/verify`: validate/consume token, issue session, redirect to the
      validated `next` or onward. *(R-AUTH-5,6, R-NAV-5,6)*
- [ ] Persistent session cookie + `/auth/me` (incl. `roles[]` + `permissions[]`)
      + `/auth/logout`. *(R-AUTH-7,8, R-ROLE-4)*
- [ ] Mailer with two transports: own SMTP server, and dev `outbox` that sends
      nothing. *(design §1, R-DEV-1,4)*
- [ ] Admin outbox screen + `GET/DELETE /admin/outbox`, registered only in dev.
      *(R-DEV-2,3, F14)*
- [ ] Verify magic-link deliverability to a phone inbox (<30 s, not spam);
      confirm from-address + SPF/DKIM. *(R-NFR-3, open question 4)*
- [ ] Onboarding screen + `POST /api/onboarding` (name, optional job title,
      consent version/ts). *(R-ONB-1..4, R-ROLE-8)*
- [ ] Consent copy wired in: email-sharing on connect + membership by invitation.
      *(R-ONB-5)*
- [ ] Route guard: active + onboarded required for `/api/*`; deep links land on
      onboarding first. *(R-NAV-7)*

## M2 — Ask journey *(M3 → M4 → M5, F5)*

- [ ] Submit screen: textarea, read-only example hints (no insert action),
      >30-char gate from config + counter. *(R-ASK-1,2,3, R-CFG-1,2)*
- [ ] `POST /api/challenges` + matcher service (keyword scorer §5). *(R-ASK-4,5)*
- [ ] Domain screen (`/challenges/:id`) + separate trend-picker **screen**
      (`/challenges/:id/trend`); `PATCH /api/challenges/:id`. *(R-ASK-6,7, R-NAV-2)*
- [ ] `GET /api/challenges/:id/matches`: same boat / been there / cases (no
      emails). *(R-ASK-8)*
- [ ] Matches screen with Follow + Connect; trend detail / case studies as its
      own screen (`/trends/:trendId`). *(R-ASK-9,10, R-NAV-2)*

## M3 — Offer journey *(M6, F6)*

- [ ] `GET /api/deck`: next challenges, exclude own + already-swiped. *(R-OFF-1,2)*
- [ ] Swipe UI: same boat / been there / follow / skip. *(R-OFF-3)*
- [ ] "Been there" note as its own screen, >30 chars from config + counter.
      *(R-OFF-4, R-CFG-1,2, R-NAV-2)*
- [ ] `POST /api/swipe` records swipe and, for same boat/been there, creates a
      connection request. *(R-OFF-3)*
- [ ] Empty-deck screen with session summary. *(R-OFF-5)*
- [ ] 🥚 "Trend 0 — Trust" easter egg on the empty deck: cosmetic only, records
      nothing, dismissible, keyboard-reachable. *(R-OFF-6)*

## M4 — Connecting (double opt-in) *(M7 → M8 — privacy-critical, F7)*

- [ ] Connection-request **screen** + `POST /api/connections`: pending request,
      notify target, no email. *(R-CONN-1,2, R-NAV-2)*
- [ ] Cockpit incoming list + incoming-request screen with accept/decline.
      *(R-MINE-2, R-CONN-3,4, R-NAV-2)*
- [ ] Contact screen + `GET /api/connections/:id/contact`: email + mailto only
      when accepted and caller is a party. *(R-CONN-3,6)*
- [ ] Duplicate-request guard. *(R-CONN-5)*
- [ ] Cockpit: my challenge(s) + counts, followed trends, nav badge. *(R-MINE-1,3,4)*

## M5 — Supporting features *(Should-haves)*

- [ ] Admin approvals screen + `/admin/applicants/*`, whitelist add; both
      permission-guarded. *(S1, R-AUTH-3, R-ROLE-3)*
- [ ] Follow endpoints + UI. *(S2, R-ASK-9)*
- [ ] Mixpanel wired in (client + server, **EU endpoints**, project created with
      EU residency), pseudonymous id, event set from design §7, consent-gated.
      *(S3, R-ANA-1..5)*
- [ ] Email notification on incoming connection request, deep-linking to
      `/matches/requests/:id` with no challenge text or contact detail.
      *(S4, R-CONN-2, R-NAV-9)*
- [ ] Feedback mailto. *(S5, R-FB-1)*
- [ ] Admin GDPR delete. *(R-NFR-7)*

## M6 — Hardening & pilot *(by 2026-11-01)*

- [ ] Mobile-first pass on every screen (portrait phone). *(R-NFR-2)*
- [ ] Rate-limit auth, verify token hashing, session flags, permission + party
      checks on every read. *(R-NFR-5, R-ROLE-5, design §8)*
- [ ] Production seed: attendee whitelist + the ~15 real collected challenges
      from env-pointed private files; admins granted the `admin` role.
      *(S6, R-SEED-3,5,6)*
- [ ] Decide and implement challenge attribution for the production seed.
      *(open question 5)*
- [ ] Deep-link pass: every email/QR target opens correctly signed out, signed
      in, and un-onboarded; `next` validation rejects external URLs.
      *(R-NAV-5,6,7, F13)*
- [ ] Invite-link dry run: create one, scan it on a phone as an unknown address,
      revoke it, confirm the next scan falls to the applicant flow. *(R-INV-3,5)*
- [ ] QR-code entry flow validated end-to-end on a phone; time scan → onboarding
      complete (<2 min). *(R-NFR-3)*
- [ ] CI green on `main`. *(R-QA-6)*
- [ ] Pilot test with 2–3 people; fix blockers. *(Meeting: "ready means we tested
      it… with a couple of people.")*

## Post-beta backlog *(Could / Won't-for-now)*

- [ ] LLM trend classifier replacing keywords (same interface). *(C5)*
- [ ] `moderator` role + moderation screens — a role row plus a permission-matrix
      column, no schema change. *(C2, R-ROLE-6)*
- [ ] Live peer counts per trend. *(C3)*
- [ ] Self-service GDPR deletion. *(C4)*
- [ ] (Deferred) gamification, theme toggle, frontier nomination, platform
      integration, phone/LinkedIn connect. *(W1–W6)*

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
