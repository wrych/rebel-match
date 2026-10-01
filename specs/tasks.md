# Rebel Match — Implementation Plan

Milestones toward the beta. Hard dates from the meeting:

- **2026-11-01** — feature-complete and tested (one week before the summit).
- **2026-11-08** — summit launch (QR codes, used during breaks).
- **~2026-11-15** — Ivo unavailable after this; keep critical work before it.

Each task cites the requirement (`R-*`) and priority (`M/S/C`) it serves.

---

## M0 — Foundation

- [ ] Node + Express skeleton, `mysql2` pool, env-driven `config.js`. *(design §1)*
- [ ] Migrations for all tables in `design.md` §2.
- [ ] Seed scripts: `trends` + `cases` from §6.1/§6.2 (required to demo). *(M10)*
- [ ] Health check + basic request validation + error handling middleware.

## M1 — Auth & onboarding *(M1, M2 — gates everything)*

- [ ] `POST /auth/request-link`: whitelist check, token create, send email;
      unknown email → applicant + admin notice. *(R-AUTH-1,2,4)*
- [ ] `GET /auth/verify`: validate/consume token, issue session. *(R-AUTH-5,6)*
- [ ] Persistent session cookie + `/auth/me` + `/auth/logout`. *(R-AUTH-7,8)*
- [ ] SMTP mailer service (nodemailer) with a magic-link template. *(design §1)*
- [ ] Onboarding screen + `POST /api/onboarding` (name + consent version/ts). *(R-ONB-1..4)*
- [ ] Consent copy wired in, stating email-sharing + closed membership. *(R-ONB-5)*
- [ ] Route guard: active + onboarded required for `/api/*`.

## M2 — Ask journey *(M3 → M4 → M5)*

- [ ] Submit screen: textarea, examples, ≥12-char gate. *(R-ASK-1,2,3)*
- [ ] `POST /api/challenges` + matcher service (keyword scorer §5). *(R-ASK-4,5)*
- [ ] Domain screen: show trend, from→to, peer line, pick-another sheet;
      `PATCH /api/challenges/:id`. *(R-ASK-6,7)*
- [ ] `GET /api/challenges/:id/matches`: same boat / been there / cases (no
      emails). *(R-ASK-8)*
- [ ] Matches screen UI with Follow + Connect (opens request). *(R-ASK-9,10)*

## M3 — Offer journey *(M6)*

- [ ] `GET /api/deck`: next challenges, exclude own + already-swiped. *(R-OFF-1,2)*
- [ ] Swipe UI: same boat / been there (+note ≥5 chars) / follow / skip. *(R-OFF-3,4)*
- [ ] `POST /api/swipe` records swipe and, for same boat/been there, creates a
      connection request. *(R-OFF-3)*
- [ ] Empty-deck state. *(R-OFF-5)*

## M4 — Connecting (double opt-in) *(M7 → M8 — privacy-critical)*

- [ ] `POST /api/connections`: pending request, notify target, no email. *(R-CONN-1,2)*
- [ ] Cockpit incoming list + `accept`/`decline`. *(R-MINE-2, R-CONN-3,4)*
- [ ] `GET /api/connections/:id/contact`: email + mailto only when accepted and
      caller is a party. *(R-CONN-3,6)*
- [ ] Duplicate-request guard. *(R-CONN-5)*
- [ ] Cockpit: my challenge(s) + counts, followed trends, nav badge. *(R-MINE-1,3,4)*

## M5 — Supporting features *(Should-haves)*

- [ ] Admin approvals screen + `/admin/applicants/*`, whitelist add. *(S1, R-AUTH-3)*
- [ ] Follow endpoints + UI. *(S2, R-ASK-9)*
- [ ] PostHog wired in (client + server), pseudonymous id, event set from
      design §7, consent-gated. *(S3, R-ANA-1..5)*
- [ ] Email notification on incoming connection request. *(S4, R-CONN-2)*
- [ ] Feedback mailto. *(S5, R-FB-1)*
- [ ] Admin GDPR delete. *(R-NFR-7)*

## M6 — Hardening & pilot *(by 2026-11-01)*

- [ ] Mobile-first pass on every screen (portrait phone). *(R-NFR-2)*
- [ ] Rate-limit auth, verify token hashing, session flags, authz checks on every
      read. *(R-NFR-5, design §8)*
- [ ] Load the ~15 real collected challenges as seed. *(S6, R-ASK seed)*
- [ ] QR-code entry flow validated end-to-end on a phone.
- [ ] Pilot test with 2–3 people; fix blockers. *(Meeting: "ready means we tested
      it… with a couple of people.")*

## Post-beta backlog *(Could / Won't-for-now)*

- [ ] LLM trend classifier replacing keywords (same interface). *(C5)*
- [ ] Richer admin dashboard / moderation. *(C2)*
- [ ] Live peer counts per trend. *(C3)*
- [ ] Self-service GDPR deletion. *(C4)*
- [ ] (Deferred) gamification, theme toggle, frontier nomination, platform
      integration, phone/LinkedIn connect. *(W1–W6)*

---

## Definition of done (beta)

1. A whitelisted member can: magic-link in → onboard (name + consent) → submit a
   challenge → see it matched to a trend → see same boat / been there / cases.
2. A member can swipe others' challenges and request to connect.
3. A connection exchanges emails **only after both opt in**.
4. Works on a phone from a QR code.
5. Usage is visible in PostHog without any PII leaving the app.
6. Tested with a small pilot group before 2026-11-01.
