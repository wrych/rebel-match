# Rebel Match — Technical Design

Implements [`requirements.md`](requirements.md). Stack: **Node.js (Express) +
MySQL**, single-page mobile-first client served by the Node app.

---

## 1. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (mobile-first SPA)                                  │
│  - screens: login, onboarding, submit, domain, matches,      │
│    swipe, cockpit, admin                                      │
│  - session cookie (http-only) sent with every /api call      │
│  - PostHog JS (analytics, pseudonymous id)                   │
└───────────────┬─────────────────────────────────────────────┘
                │ HTTPS (JSON)
┌───────────────▼─────────────────────────────────────────────┐
│  Node.js / Express server                                    │
│  - /auth    magic-link request + verify, session issue       │
│  - /api     challenges, matches, swipe, connections, follow  │
│  - /admin   applicant approval, whitelist                    │
│  - services: mailer (SMTP), matcher (trend detect), analytics│
└───────────────┬───────────────────────┬─────────────────────┘
                │ SQL (mysql2/pool)      │ SMTP
┌───────────────▼──────────┐   ┌─────────▼───────────┐
│  MySQL                   │   │  Email provider     │
│  members, challenges,    │   │  (magic links +     │
│  trends, cases,          │   │   notifications)    │
│  connections, follows,   │   └─────────────────────┘
│  magic_tokens, events?   │
└──────────────────────────┘
```

### Suggested layout

```
/server
  app.js                 Express app + middleware
  db.js                  mysql2 connection pool
  config.js              env-driven config
  auth/                  magic link + sessions
  routes/                auth, challenges, matches, swipe, connections, admin
  services/
    mailer.js            SMTP (nodemailer)
    matcher.js           keyword trend detection (§5)
    analytics.js         PostHog server-side capture
  seed/                  trends.js, cases.js, challenges.js
/migrations              SQL schema migrations
/client                  SPA (or server-rendered templates)
/specs                   this spec
```

### Key libraries

- `express`, `mysql2` (promise pool), `nodemailer`, `cookie-session` or
  `express-session` (store in MySQL), `zod`/`joi` for request validation,
  `posthog-node` (server events) + `posthog-js` (client events).

---

## 2. Data model (MySQL)

All tables InnoDB, `utf8mb4`. IDs are `BINARY(16)` UUIDs or `BIGINT AUTO_INCREMENT`
(examples use `CHAR(36)` for readability). Timestamps UTC.

### members

```sql
CREATE TABLE members (
  id             CHAR(36)     NOT NULL PRIMARY KEY,
  email          VARCHAR(255) NOT NULL,
  name           VARCHAR(120) NULL,               -- set at onboarding
  role           VARCHAR(120) NULL,
  org            VARCHAR(160) NULL,
  sector         VARCHAR(160) NULL,
  status         ENUM('applicant','active','rejected','deleted')
                              NOT NULL DEFAULT 'applicant',
  is_admin       TINYINT(1)   NOT NULL DEFAULT 0,
  consent_version VARCHAR(20) NULL,
  consent_at     DATETIME     NULL,
  analytics_id   CHAR(36)     NOT NULL,           -- pseudonymous id for PostHog
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_members_email (email)
);
```

A member on the **whitelist** is simply a `members` row with `status='active'`
(or pre-seeded with `status='active'` and `name=NULL`). An **applicant** is
`status='applicant'`. Onboarding is complete when `name` and `consent_at` are set.

### magic_tokens

```sql
CREATE TABLE magic_tokens (
  id          CHAR(36)     NOT NULL PRIMARY KEY,
  member_id   CHAR(36)     NOT NULL,
  token_hash  CHAR(64)     NOT NULL,              -- sha-256 of the raw token
  expires_at  DATETIME     NOT NULL,
  used_at     DATETIME     NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_tokens_member (member_id),
  UNIQUE KEY uq_token_hash (token_hash),
  CONSTRAINT fk_token_member FOREIGN KEY (member_id) REFERENCES members(id)
);
```

### trends (seed, static)

```sql
CREATE TABLE trends (
  id         CHAR(2)      NOT NULL PRIMARY KEY,    -- '01'..'08'
  short      VARCHAR(80)  NOT NULL,
  from_label VARCHAR(80)  NOT NULL,                -- what it moves away from
  peers      INT          NOT NULL DEFAULT 0,      -- display count
  keywords   JSON         NOT NULL                 -- {"strong":[...], "weak":[...]}
);
```

### cases (seed, static)

```sql
CREATE TABLE cases (
  id        BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  trend_id  CHAR(2)      NOT NULL,
  org       VARCHAR(120) NOT NULL,
  url       VARCHAR(400) NOT NULL,
  takeaway  VARCHAR(400) NOT NULL,
  CONSTRAINT fk_case_trend FOREIGN KEY (trend_id) REFERENCES trends(id)
);
```

### challenges

```sql
CREATE TABLE challenges (
  id          CHAR(36)     NOT NULL PRIMARY KEY,
  member_id   CHAR(36)     NOT NULL,
  body        TEXT         NOT NULL,
  trend_id    CHAR(2)      NULL,                   -- confirmed trend
  auto_trend  CHAR(2)      NULL,                   -- what the matcher picked
  overridden  TINYINT(1)   NOT NULL DEFAULT 0,     -- member changed the trend
  status      ENUM('draft','active','archived') NOT NULL DEFAULT 'active',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_challenge_member (member_id),
  KEY ix_challenge_trend (trend_id),
  CONSTRAINT fk_challenge_member FOREIGN KEY (member_id) REFERENCES members(id),
  CONSTRAINT fk_challenge_trend  FOREIGN KEY (trend_id)  REFERENCES trends(id)
);
```

### member_expertise ("been there" supply)

A member signals the trends they can help on (from offering help / their
profile). Populates "Been there" lists.

```sql
CREATE TABLE member_expertise (
  member_id CHAR(36)     NOT NULL,
  trend_id  CHAR(2)      NOT NULL,
  note      VARCHAR(400) NULL,
  PRIMARY KEY (member_id, trend_id),
  CONSTRAINT fk_exp_member FOREIGN KEY (member_id) REFERENCES members(id),
  CONSTRAINT fk_exp_trend  FOREIGN KEY (trend_id)  REFERENCES trends(id)
);
```

### connection_requests (double opt-in)

```sql
CREATE TABLE connection_requests (
  id            CHAR(36) NOT NULL PRIMARY KEY,
  requester_id  CHAR(36) NOT NULL,
  target_id     CHAR(36) NOT NULL,
  challenge_id  CHAR(36) NULL,                     -- the challenge in context
  kind          ENUM('same_boat','been_there') NOT NULL,
  message       VARCHAR(600) NULL,                 -- offer note / intro
  status        ENUM('pending','accepted','declined') NOT NULL DEFAULT 'pending',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  responded_at  DATETIME NULL,
  KEY ix_req_target (target_id, status),
  KEY ix_req_requester (requester_id),
  UNIQUE KEY uq_pending (requester_id, target_id, challenge_id, kind),
  CONSTRAINT fk_req_requester FOREIGN KEY (requester_id) REFERENCES members(id),
  CONSTRAINT fk_req_target    FOREIGN KEY (target_id)    REFERENCES members(id)
);
```

Emails are **never stored on the request**. They are resolved by joining to
`members` only when `status='accepted'` and the viewer is one of the two parties.

### follows

```sql
CREATE TABLE follows (
  member_id CHAR(36) NOT NULL,
  trend_id  CHAR(2)  NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (member_id, trend_id),
  CONSTRAINT fk_follow_member FOREIGN KEY (member_id) REFERENCES members(id),
  CONSTRAINT fk_follow_trend  FOREIGN KEY (trend_id)  REFERENCES trends(id)
);
```

### swipes (optional, analytics/matching memory)

```sql
CREATE TABLE swipes (
  member_id   CHAR(36) NOT NULL,
  challenge_id CHAR(36) NOT NULL,
  action      ENUM('same_boat','been_there','follow','skip') NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (member_id, challenge_id, action)
);
```

---

## 3. API

All `/api/*` and `/admin/*` routes require an authenticated session and a member
with `status='active'` and completed onboarding (except the onboarding routes).

### Auth

| Method | Path | Body | Behavior |
|--------|------|------|----------|
| POST | `/auth/request-link` | `{email}` | If whitelisted active member → create token, email link, return 200 (always 200 to avoid email enumeration). If unknown email → create `applicant`, notify admin. |
| GET | `/auth/verify?token=…` | — | Validate token (unexpired, unused), consume it, create session, redirect to onboarding or app. |
| POST | `/auth/logout` | — | Destroy session. |
| GET | `/auth/me` | — | Current member + onboarding/consent status. |

### Onboarding

| Method | Path | Body | Behavior |
|--------|------|------|----------|
| POST | `/api/onboarding` | `{name, role?, org?, sector?, consentVersion}` | Set name/profile, record consent version + timestamp. Required before other `/api` routes. |

### Ask journey

| Method | Path | Body | Behavior |
|--------|------|------|----------|
| POST | `/api/challenges` | `{body}` | Create challenge, run matcher, return challenge with `autoTrend`. |
| PATCH | `/api/challenges/:id` | `{trendId}` | Confirm/override trend; set `overridden` if changed. |
| GET | `/api/challenges/:id/matches` | — | `{sameBoat[], beenThere[], cases[]}` for the challenge's trend (no emails). |

### Offer journey

| Method | Path | Body | Behavior |
|--------|------|------|----------|
| GET | `/api/deck` | — | Next challenges to swipe (exclude own, exclude already-swiped). |
| POST | `/api/swipe` | `{challengeId, action, note?}` | Record swipe; for `same_boat`/`been_there` also create a connection request (§connect). |

### Connections (double opt-in)

| Method | Path | Body | Behavior |
|--------|------|------|----------|
| POST | `/api/connections` | `{targetId, challengeId?, kind, message?}` | Create pending request; notify target; **no email revealed**. |
| GET | `/api/connections/incoming` | — | Pending requests addressed to me (for the cockpit). |
| POST | `/api/connections/:id/accept` | — | Mark accepted; now both parties' emails are returned to each other. |
| POST | `/api/connections/:id/decline` | — | Mark declined; emails stay private. |
| GET | `/api/connections/:id/contact` | — | If accepted and I'm a party → the other member's email + prefilled mailto. Else 403. |

### Follow

| Method | Path | Behavior |
|--------|------|----------|
| POST | `/api/follows/:trendId` | Follow a trend. |
| DELETE | `/api/follows/:trendId` | Unfollow. |
| GET | `/api/follows` | My followed trends. |

### Admin

| Method | Path | Behavior |
|--------|------|----------|
| GET | `/admin/applicants` | List pending applicants. |
| POST | `/admin/applicants/:id/approve` | Set `status='active'`. |
| POST | `/admin/applicants/:id/reject` | Set `status='rejected'`. |
| POST | `/admin/whitelist` | Add email(s) as pre-approved active member(s). |
| DELETE | `/admin/members/:id` | GDPR erasure: delete member + their challenges/requests. |

---

## 4. Screens (≈10, matching the prototype)

1. **Login** — email field → "check your email".
2. **Magic-link landing** — token verify → routes onward.
3. **Onboarding** — name + consent (first time only).
4. **Welcome** — two doors: *Ask for help* / *Offer help*.
5. **Submit challenge** — textarea + examples; disabled until ≥12 chars.
6. **Domain / trend** — shows detected trend, "from → to", peer line, "see all 8
   trends", confirm; sheet to pick another trend.
7. **Matches (for my challenge)** — Same boat / Been there / Case studies;
   follow; connect (opens request, not mailto).
8. **Swipe deck** — card stack; Same boat / Been there (+ note) / Follow / arrows.
9. **Matches cockpit** — my challenge(s) with counts, incoming requests to
   Accept/Decline, followed trends.
10. **Admin approvals** — applicant list with approve/reject.

Plus modals: connection-request confirm, "accepted → here's their contact",
case-studies sheet, trend-picker sheet, feedback (mailto).

**Removed vs prototype:** standings/badges screen, milestone pop-ups, CR theme
toggle, "nominate as frontier".

---

## 5. Trend matching algorithm

Beta uses the prototype's deterministic keyword scorer (no LLM). Each trend has
**strong** keywords (weight 6) and **weak** keywords (weight 1). Score a
challenge's lowercased text against every trend; highest score wins; ties/no
match fall back to a default trend. The member can always override.

```js
// services/matcher.js
function detectTrend(text, trends) {
  const s = (text || '').toLowerCase();
  let best = null, bestScore = 0;
  for (const t of trends) {
    let score = 0;
    for (const k of t.keywords.strong) if (s.includes(k)) score += 6;
    for (const k of t.keywords.weak)   if (s.includes(k)) score += 1;
    if (score > bestScore) { bestScore = score; best = t; }
  }
  return best || trends.find(t => t.id === '06'); // default: Distributed Decision Making
}
```

Post-beta upgrade (Could-have C5): replace with an LLM classifier that returns a
trend id + confidence; keep the same interface so callers don't change.

---

## 6. Seed data (extracted from the prototype)

### 6.1 The 8 trends

| id | short | from | peers | strong keywords (weight 6) | weak keywords (weight 1) |
|----|-------|------|------:|----------------------------|--------------------------|
| 01 | Purpose & Values | Profit | 12 | purpose, values, mission statement, meaning | purpose, values, mission, meaning, culture fit, recruit, brand |
| 02 | Network of Teams | Hierarchical Pyramid | 34 | org chart, shadow organi, shadow organis, middle management, network of teams, silo, reorg | structure, hierarch, circle, team, silo, reorg, pyramid, shadow, department |
| 03 | Supportive Leadership | Directive Leadership | 27 | micromanag, leadership means, management position, coach, directive | leader, manager, boss, command, let go, supervisor |
| 04 | Experiment & Adapt | Plan & Predict | 15 | budget cycle, annual budget, forecast, experiment, pilot, okr | budget, plan, forecast, experiment, pilot, agile, roadmap |
| 05 | Freedom & Trust | Rules & Control | 21 | remote, hybrid, office days, vacation, working hours, four-day, approval | trust, freedom, rule, policy, autonom, control, hours |
| 06 | Distributed Decision Making | Centralized Authority | 29 | who decides, who can decide, who actually can decide, decision-making, decision making, decision rights, mandate, advice process, consent | decision, decide, authority, mandate, consent, power, empower, escalat |
| 07 | Radical Transparency | Secrecy | 18 | salary, salaries, pay model, compensation, remuneration, bonus, open book, transparen, wage | transparen, salary, pay, compensation, financial, secret, reward, bonus |
| 08 | Talents & Mastery | Job Descriptions | 23 | performance review, peer feedback, job description, job title, appraisal, promotion, career path, talent | talent, job, review, feedback, career, promotion, development, mastery |

Default/fallback trend when nothing scores: **06 — Distributed Decision Making**.

Display state per trend (prototype's `stateMap`, used only for the chip label in
match/swipe cards): 01 Shared, 02 Frontier, 03 Frontier, 04 Solved, 05 Shared,
06 Shared, 07 Shared, 08 Solved.

### 6.2 Case studies (per trend)

> All URLs are `https://www.corporate-rebels.com/blog/<slug>`.

- **01 Purpose & Values**: Patagonia (`patagonia`) — purpose as a filter for every
  business decision · Tony's Chocolonely (`tonys-chocolonely`) — a mission
  uncomfortable enough to activate outsiders · Morning Star (`morning-star`) —
  purpose translated into individual commitments.
- **02 Network of Teams**: Haier (`haier-overview`) — 80,000 people as micro-
  enterprises · Buurtzorg (`buurtzorg`) — teams of 12, no managers · 10 real
  structures (`progressive-organizational-structures`) · Viisi (`viisi`) — twelve
  years of Holacracy.
- **03 Supportive Leadership**: FAVI (`zobrist`) — removed the control apparatus ·
  Haufe Umantis (`haufe-umantis`) — employees elect their leaders · USS Santa Fe
  (`david-marquet`) — leader-leader on a submarine.
- **04 Experiment & Adapt**: Spotify (`spotify-1`) — bets and squads · UKTV
  (`uktv`) — unasked questions as an experiment engine · Matt Black Systems
  (`matt-black-systems`) — every person a business unit.
- **05 Freedom & Trust**: FOD Social Security (`frank-van-massenhove`) — nobody
  checks where you work · Happy Ltd (`here-are-4-ways-to-effectively-build-more-
  trust-and-freedom-in-your-team`) · Ryzon (`ryzon-s-journey-to-a-4-day-work-
  week`) — the four-day week.
- **06 Distributed Decision Making**: Advice process (`advice-process`) · Morning
  Star (`morning-star`) — colleague letters of understanding · Decision mapping
  (`distribute-decision-making`) · Smarkets (`smarkets`) — decisions in the open.
- **07 Radical Transparency**: Freitag (`freitag-we-have-radically-simplified-our-
  salary-scales`) · Flat-org pay (`remuneration-method-for-flat-organizations`) ·
  Self-set salaries (`self-set-salaries`) · Semco (`semco`) — open books.
- **08 Talents & Mastery**: Netflix (`annual-performance-reviews`) — killed the
  annual review · NextJump (`next-jump`) — continuous peer coaching · Spotify
  (`spotify-development`) — development without a career ladder · Job crafting
  (`job-crafting`).

### 6.3 Seed people / challenges

The prototype ships a fictional roster (Marieke de Wit, Tobias Renner, Ana
Ferreira, Jonas Brand, Priya Raman, Lars Petersen, Nadia Osei, Ruben Vos, Aline
Dubois, plus challenge-authors Sanne Kuipers, Milan Horvat, Elena Marchetti, Ola
Nyberg, Yusuf Kaya, Hanna Vogt, Diego Salas) with roles, orgs, sectors, trends,
and either an experience note ("been there") or a challenge ("same boat"). These
can seed the swipe deck for demos. **Preferred:** replace them with the ~15 real
challenges already collected for the summit.

---

## 7. Analytics (free, Mixpanel-style)

**Chosen tool: PostHog.** Event-based product analytics (funnels, retention,
paths) like Mixpanel, with a **free cloud tier** (generous monthly event
allowance), an **EU-hosted cloud** option (good for the privacy posture), and a
**self-host** fallback if cloud is undesirable.

Alternatives considered:
- **Umami / Plausible** — privacy-friendly and free (self-host) but oriented to
  pageview web analytics; weaker for event funnels/retention. Good fallback if
  only basic usage counts are needed.
- **Matomo / Countly (community)** — self-host, heavier to operate.
- **Mixpanel itself** — has a free tier, but the ask was a free alternative; kept
  as a reference point.

### Instrumentation rules (enforce R-ANA-2/3)

- Identify users by `members.analytics_id` (pseudonymous UUID), **never** email
  or name.
- Capture these events with non-identifying properties only:

  | event | properties |
  |-------|-----------|
  | `login_completed` | — |
  | `onboarding_completed` | `consent_version` |
  | `journey_chosen` | `journey: ask\|offer` |
  | `challenge_submitted` | `char_count` |
  | `trend_assigned` | `trend_id`, `overridden: bool` |
  | `swipe` | `action`, `trend_id` |
  | `connection_requested` | `kind` |
  | `connection_responded` | `status: accepted\|declined` |
  | `feedback_opened` | `screen` |

- **Never** send challenge `body`, member `name`, `email`, `org`.
- Gate capture on analytics consent (R-ANA-4). Prefer server-side capture
  (`posthog-node`) for connection/consent events so they can't be blocked by ad
  blockers; client-side (`posthog-js`) for UI interactions.

---

## 8. Security & privacy notes

- Magic-link tokens: generate 32 bytes random, email the raw token, store only
  its SHA-256. Single-use, 15-min expiry. Rate-limit `/auth/request-link` per
  email/IP.
- Sessions: http-only, `Secure`, `SameSite=Lax` cookie; server-side session store
  in MySQL.
- Authorization: every challenge/connection/contact read must check the caller is
  a party or owner. Contact endpoint returns an email **only** for an accepted
  request where the caller is one of the two members.
- No member directory endpoint; no bulk export outside admin GDPR deletion.
- All secrets via env (`DATABASE_URL`, `SESSION_SECRET`, `SMTP_*`,
  `POSTHOG_KEY`, `POSTHOG_HOST`).
