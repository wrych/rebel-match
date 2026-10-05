# Rebel Match — Technical Design

Implements [`requirements.md`](requirements.md). Stack: **Node.js (Express) +
Postgres** (ADR 0024), single-page mobile-first client served by the Node app.

---

## 1. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (mobile-first SPA)                                  │
│  - screens: login, onboarding, submit, domain, matches,      │
│    swipe, cockpit, admin                                      │
│  - session cookie (http-only) sent with every /api call      │
│  - Mixpanel JS (analytics, pseudonymous id)                  │
└───────────────┬─────────────────────────────────────────────┘
                │ HTTPS (JSON)
┌───────────────▼─────────────────────────────────────────────┐
│  Node.js / Express server                                    │
│  - /auth    magic-link request + verify, session issue       │
│  - /api     challenges, matches, swipe, connections, follow  │
│  - /admin   applicant approval, whitelist                    │
│  - services: mailer (SMTP), matcher (trend detect), analytics│
└───────────────┬───────────────────────┬─────────────────────┘
                │ SQL (Drizzle)          │ SMTP
┌───────────────▼──────────┐   ┌─────────▼───────────┐
│  Postgres 17             │   │  Own SMTP server    │
│  members, challenges,    │   │  (magic links +     │
│  trends, cases,          │   │   notifications)    │
│  connections, follows,   │   └─────────────────────┘
│  magic_tokens, events?   │
└──────────────────────────┘
```

### Suggested layout

```
/src                     server (TypeScript, ESM)
  app.ts                 Express app + middleware
  db/                    Drizzle schema, the Postgres or PGlite connection
  config.ts              env-driven config (§Configuration)
  routes.ts              THE SHARED ROUTE TABLE (ADR 0017) — imported by the
                         client router and by the server's `next` validator
  auth/                  THE AUTH SEAM (ADR 0015) — tokens, sessions, nothing
                         else knows how a member proves who they are
  routes/                auth, challenges, matches, swipe, connections, admin
  services/
    mailer.ts            records to the outbound log, then delivers per
                         `mail.delivery` (§Mail delivery)
    matcher.ts           keyword trend detection (§5)
    analytics.ts         Mixpanel server-side capture
  seed/                  profile-based fixtures (§6): shared / dev / prod
/migrations              SQL schema migrations, forward-only
/client                  Vue 3 SPA (Vite, TypeScript, vue-router) — ADR 0017
  main.ts                app + router mount
  router.ts              routes built from /src/routes.ts
  guards.ts              session / onboarding / permission guards, pure where
                         possible so R-QA-1 can test them without a browser
  screens/               one component per screen in §4
/specs                   this spec
/docs                    constitution + ADRs
```

### Configuration (`config.js`)

One module owns every tunable (R-CFG-1..4). Secrets come from env; product
thresholds have sane defaults in the file and may be overridden by env.

| Key                            | Default                       | Serves                    |
| ------------------------------ | ----------------------------- | ------------------------- |
| `limits.challengeMinChars`     | `31` (i.e. "more than 30")    | R-ASK-3                   |
| `limits.beenThereNoteMinChars` | `31`                          | R-OFF-4                   |
| `limits.magicLinkTtlMinutes`   | `15`                          | R-AUTH-5                  |
| `limits.approvalLinkTtlHours`  | `24`                          | R-AUTH-10                 |
| `sessionTtlDays` (idle)        | `30`                          | R-AUTH-7                  |
| `limits.inviteDefaultMaxUses`  | `400`                         | R-INV-4                   |
| `limits.inviteDefaultHours`    | `12`                          | R-INV-2                   |
| `consent.currentVersion`       | e.g. `"2026-11-01"`           | R-ONB-3, R-ONB-4          |
| `mail.delivery`                | `smtp` \| `none`              | R-DEV-1, R-DEV-4, R-DEV-5 |
| `limits.outboxRetentionDays`   | `30`                          | R-MSG-6                   |
| `limits.erasureGraceDays`      | `30`                          | R-NFR-7                   |
| `outboxPurgeIntervalHours`     | `1`                           | R-MSG-6                   |
| `erasureSweepIntervalHours`    | `1`                           | R-NFR-7                   |
| `tokenPurgeIntervalHours`      | `1`                           | R-NFR-5                   |
| `limits.outboxPageSize`        | `100`                         | R-MSG-5                   |
| `limits.deckPageSize`          | `20`                          | R-OFF-1                   |
| `limits.matchesPollSeconds`    | `30`                          | R-MINE-4                  |
| `limits.whitelistBatchMax`     | `1000`                        | R-AUTH-1                  |
| `limits.savedTickMs`           | `2500`                        | R-PROF-1                  |
| `limits.holdToSelectMs`        | `500`                         | R-MEM-3                   |
| `abuse.linkEmailsBeforeCheck`  | `3`                           | R-NFR-8                   |
| `abuse.linkEmailsCeiling`      | `10`                          | R-NFR-8                   |
| `abuse.linkEmailWindowMinutes` | `15`                          | R-NFR-8                   |
| `abuse.authRequestsPerIp`      | `1000`                        | R-NFR-8                   |
| `abuse.ipWindowMinutes`        | `15`                          | R-NFR-8                   |
| `abuse.applicantsBeforeCheck`  | `30`                          | R-NFR-8                   |
| `abuse.applicantsCeiling`      | `300`                         | R-NFR-8                   |
| `abuse.applicantWindowMinutes` | `60`                          | R-NFR-8                   |
| `abuse.humanCheckCost`         | `1000`                        | R-NFR-8                   |
| `abuse.humanCheckMinutes`      | `5`                           | R-NFR-8                   |
| `trustProxy` (`TRUST_PROXY`)   | `0`; `1` on Cloud Run         | R-NFR-8                   |
| `settingsRefreshSeconds`       | `60`                          | R-CFG-6                   |
| `seed.profile`                 | `dev` \| `prod`               | R-SEED-4                  |
| `analytics.apiHost`            | `api-eu.mixpanel.com`         | R-ANA-5                   |
| `rolePermissions`              | role → permission matrix (§2) | R-ROLE-3, R-ROLE-6        |

- `GET /api/config` returns the **client-relevant subset** (`limits`,
  `consent.currentVersion`) so the submit button, the note counter, and the
  server validator share one source of truth (R-CFG-2). It exposes no secrets.
- The server validates against `config.limits` on every write regardless of what
  the client did (R-CFG-3).

### The auth seam

`auth/` is the only module that knows how a member proves who they are: token
generation and hashing, TTLs per link kind, cookie format, session storage. It
exposes `issueLink`, `verifyToken`, `createSession`, `currentMember`, `endSession`
and nothing else (ADR 0015).

- Nothing outside `auth/` reads or writes `magic_tokens`, builds a cookie, or
  knows a TTL. A route that touches a token hash is a defect.
- Routes and services receive the interface, never import a concrete
  implementation — which is what lets R-QA-1's token tests run against a fake,
  with no database.
- **Admission policy deliberately stays outside** the seam: the whitelist,
  applicants, approvals, invite tokens and consent are ours in every scenario, so
  putting them behind an auth interface would only mean pulling them back out if
  we ever adopt a provider.
- `currentMember` returns roles and permissions already resolved, so no handler
  depends on the shape of a token or a provider's claims.

### The development database

In development with no `DATABASE_URL`, the server opens **PGlite** — Postgres
compiled to WebAssembly, running in the Node process — in `.data/pglite`, a
local data folder that git ignores, and `npm run dev` migrates and seeds it. No
database server, Docker or `.env` is needed: with no `DATABASE_URL`, a missing
`SESSION_SECRET` is generated at random on first start into
`.data/session-secret`, readable by its owner only, so no secret is ever
committed. Config refuses `NODE_ENV=production` without both values
(ADR 0024). `npm run db:reset` deletes the database folder so the next migrate
rebuilds it.

PGlite admits one process per folder. A lock beside the folder makes a second
process, such as `npm run dev:login` while the server runs, stop with a clear
message rather than corrupt the data; a lock left by a process that died is
taken over, and the server closes the database on `SIGINT` and `SIGTERM` so a
`tsx watch` restart finds the folder free.

PGlite runs the same Postgres 17 as CI and production, so the engine does not
drift. What it cannot prove is that the real server agrees, which is why CI
also runs the migrations and the integration suite against a Postgres 17
service (R-QA-4). Pointing `DATABASE_URL` at a local Postgres uses that instead
of PGlite.

### Client bundle budget

ADR 0017 put the bundle inside the R-NFR-3 measurement, so it needs a number. The
scaffold's baseline — Vue, vue-router, one screen — is **90 kB raw / 35 kB
gzipped**. That is the floor, and it is already the largest single asset on the
login path.

Budget: **under 120 kB gzipped** for the whole client. If a dependency would
breach it, the question is whether that screen needs the dependency or needs less
of it. The M6 QR dry run on a phone over conference wifi is what proves the
budget, not the number itself.

### Mail delivery

Recording and delivering are **separate concerns**. Every message is recorded in
the `outbox` table in every environment (R-MSG-1); configuration decides only
whether it then leaves the machine (R-DEV-4).

- `mail.delivery=smtp` (production) → nodemailer against the team's own SMTP
  server, `SMTP_*` from env. The stored body has the magic-link token redacted
  (R-MSG-4).
- `mail.delivery=none` → **nothing leaves the machine**. The record is written
  with status `suppressed`.
- **The stored body keeps the link only in a development deployment:**
  `NODE_ENV=development` **and** `mail.delivery=none`, so mail cannot leave the
  machine (R-DEV-1; the term is defined in requirements §8c). The pull-request
  previews and staging are development deployments too: they hold only
  fictional people, and the prod seed refuses to run there (R-SEED-8). Anything
  else redacts it (R-MSG-4): production, and a development machine pointed at a
  real SMTP server. Both inputs are configuration, so this is a config
  decision, not a code branch (R-DEV-4).
- **Production refuses to start with `delivery=none`** (R-DEV-5): a deployment that
  records magic links and sends none is one where nobody can log in, and that
  should fail at boot rather than at the first scan of the QR code.

---

### Look and colour modes

The look lives in `client/styles/theme.css` (R-LOOK-1): colour, type and spacing
tokens on `:root`, and the components (buttons, fields, cards, chips, notices) as
classes that read only those tokens. A colour mode is one more token block,
`:root[data-mood='…']`, switched by setting `data-mood` on the page; the client
remembers the choice per browser (`client/lib/mood.ts`, R-LOOK-2). Calm is the
default and happy the one alternative for the beta; a dark mode is another block
of the same shape (R-LOOK-3). Fonts are self-hosted through `@fontsource`.

The header's right-hand button opens the **menu** (R-PROF-3): the colour mode
switch, "Profile & privacy" (`/profile`), the host tools the member's
permissions allow (paths and permissions from the route table, ADR 0017), and
sign out. It is a small panel under the header, closed by Escape, by a click
outside it or by choosing an item, with focus returned to the button. Signed
out, the menu offers only the colour mode. The welcome screen keeps the two
doors and "Your matches"; host tools and sign out move into the menu.

### Key libraries

**Server** — **TypeScript** (strict, ADR 0011), `express`, `drizzle-orm` over
`pg` in production and `@electric-sql/pglite` in development and tests, `nodemailer`, `zod` for boundary validation, `mixpanel` for server-side
capture against the EU endpoint, `helmet` for the security headers (ADR 0034). Sessions are the auth seam's own (§8).

**Client** (ADR 0017) — **Vue 3** (Composition API) with `vue-router` in history
mode, built by **Vite**; no analytics script (ADR 0026). Tests use
`@vue/test-utils` with jsdom.

Two builds: `tsc` for the server, Vite for the client. The Vite dev server
proxies `/api` and `/auth` to Node.

---

## 2. Data model (Postgres)

The schema is declared in `src/db/schema.ts` and migrated by SQL files that
`drizzle-kit` generates from it (ADR 0024). The sketches below predate the
move from MySQL and show the shape, not the DDL: IDs are UUID text, timestamps
are `timestamptz` in UTC, and the duplicate-request guard is a partial unique
index over pending requests.

### members

```sql
CREATE TABLE members (
  id             CHAR(36)     NOT NULL PRIMARY KEY,
  email          VARCHAR(255) NOT NULL,
  name           VARCHAR(120) NULL,               -- display name, set at onboarding
  job_title      VARCHAR(120) NULL,               -- profile only (was `role`)
  org            VARCHAR(160) NULL,
  sector         VARCHAR(40)  NULL REFERENCES sectors(key) ON DELETE SET NULL,
  company_size   VARCHAR(20)  NULL REFERENCES company_sizes(key) ON DELETE SET NULL,
  status         ENUM('applicant','active','rejected','deleted')
                              NOT NULL DEFAULT 'applicant',
  erase_after    DATETIME     NULL,              -- set with status 'deleted' (ADR 0032)
  status_before_deletion ENUM('applicant','active','rejected') NULL, -- restored on undo
  deleted_by_self BOOLEAN    NULL,               -- only then may the person undo it
  requested_name VARCHAR(120) NULL,              -- applicant-supplied, for R-AUTH-11
  requested_org  VARCHAR(160) NULL,              -- applicant-supplied, for R-AUTH-11
  consent_version VARCHAR(20) NULL,
  consent_at     DATETIME     NULL,
  analytics_consent_version VARCHAR(20) NULL,     -- opt-in words accepted (R-ANA-4)
  analytics_consent_at      DATETIME    NULL,     -- both set = opted in
  joined_via_invite_id CHAR(36) NULL,            -- which invite admitted them (R-INV-8)
  analytics_id   CHAR(36)     NOT NULL,           -- pseudonymous id for Mixpanel
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_members_email (email)
);
```

A member on the **whitelist** is simply a `members` row with `status='active'`
(or pre-seeded with `status='active'` and `name=NULL`). An **applicant** is
`status='applicant'`. Onboarding is complete only when **both** `name` and
`consent_at` are set — `requested_name` is what the applicant typed at the door
(R-AUTH-12) and never satisfies the onboarding gate (R-ONB-1).

Two things deliberately **not** in this table:

- **No `is_admin` flag.** Access is role-based (below), so adding a moderator
  later is a data change, not a schema and code change (R-ROLE-1).
- The profile field is `job_title`, not `role` — "role" in this spec always means
  an **access role**. The onboarding API field is named `jobTitle` to match.

**Sector and company size** are picked, not typed (R-ONB-2), from lists that
ship as code and are shared with the client, so the form and the server check
read the same values (R-CFG-2). Every seed copies them into two lookup tables,
which members reference by key, so the database refuses a value off the list
too. Cards read the label through the reference, so a label can be reworded
without touching a member row.

```sql
CREATE TABLE sectors       (key VARCHAR(40) PRIMARY KEY, label VARCHAR(80) NOT NULL);
CREATE TABLE company_sizes (key VARCHAR(20) PRIMARY KEY, label VARCHAR(40) NOT NULL);
```

- **Sectors** (key → label): `agency-consulting` Agency & consulting ·
  `construction` Construction · `education` Education · `energy-utilities`
  Energy & utilities · `financial-services` Financial services ·
  `food-agriculture` Food & agriculture · `government` Government & public
  sector · `healthcare` Healthcare · `hospitality` Hospitality ·
  `industrial-services` Industrial services · `logistics` Logistics ·
  `manufacturing` Manufacturing · `media-creative` Media & creative ·
  `nonprofit` Nonprofit · `retail` Retail · `software-technology` Software &
  technology · `telecom` Telecom · `other` Other.
- **Company sizes:**

  | Key        | Label               |
  | ---------- | ------------------- |
  | `1-10`     | 1–10 employees      |
  | `11-50`    | 11–50 employees     |
  | `51-250`   | 51–250 employees    |
  | `251-1000` | 251–1,000 employees |
  | `1001+`    | 1,001+ employees    |

The migration that introduces the tables fills them, turns a stored label into
its key, and clears any sector or company size not on the lists before the
references are added.

### roles & member_roles (access control)

```sql
CREATE TABLE roles (
  role_key    VARCHAR(40)  NOT NULL PRIMARY KEY,   -- 'member', 'admin', later 'moderator'
  label       VARCHAR(80)  NOT NULL,
  description VARCHAR(255) NULL
);

CREATE TABLE member_roles (
  member_id  CHAR(36)    NOT NULL,
  role_key   VARCHAR(40) NOT NULL,
  granted_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  granted_by CHAR(36)    NULL,                     -- member who granted it, for audit
  PRIMARY KEY (member_id, role_key),
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  FOREIGN KEY (role_key)  REFERENCES roles(role_key)
);
```

- A member can hold **several roles** at once; the effective permission set is
  the union (R-ROLE-2).
- Every active member gets `member` on creation. `admin` is granted on top of it,
  not instead of it — an admin is still a member who posts challenges.
- Seeded roles for the beta: `member`, `admin`. `moderator` and anything else is
  added later as a row plus a permission-matrix entry — **no schema change, no new
  column, no `is_*` flags** (R-ROLE-1, R-ROLE-6).

**Permissions live in config, not in the database** (`config.rolePermissions`),
so the grants are reviewable in version control. They are read through a
**`PermissionPolicy`** (ADR 0021), so moving the matrix into the database later
is one new implementation, with no guard touched:

| Permission                                     | `member` | `admin` | (future) `moderator` |
| ---------------------------------------------- | :------: | :-----: | :------------------: |
| `challenge:create` / `challenge:swipe`         |    ✅    |   ✅    |          ✅          |
| `connection:request`                           |    ✅    |   ✅    |          ✅          |
| `applicant:review` (approve / reject)          |    —     |   ✅    |          ✅          |
| `whitelist:manage`                             |    —     |   ✅    |          —           |
| `member:delete` (GDPR erasure)                 |    —     |   ✅    |          —           |
| `challenge:moderate`                           |    —     |   ✅    |          ✅          |
| `invite:manage` (create / revoke QR invites)   |    —     |   ✅    |          —           |
| `outbox:read` (the outbound message log)       |    —     |   ✅    |          —           |
| `role:grant` (grant / revoke roles)            |    —     |   ✅    |          —           |
| `settings:read` (the configuration, read-only) |    —     |   ✅    |          —           |
| `settings:manage` (change what R-CFG-6 allows) |    —     |   ✅    |          —           |

- Route guards SHALL check a **permission**, never a role name —
  `requirePermission('applicant:review')`, not `if (member.isAdmin)`. Adding
  `moderator` then means one row and one matrix column, with no guard rewritten
  (R-ROLE-3).
- `GET /auth/me` returns the member's `roles[]` and resolved `permissions[]` so
  the client can hide what the member cannot do (R-ROLE-4). The server still
  enforces every permission independently (R-ROLE-5).

### magic_tokens

```sql
CREATE TABLE magic_tokens (
  id          CHAR(36)     NOT NULL PRIMARY KEY,
  member_id   CHAR(36)     NOT NULL,
  token_hash  CHAR(64)     NOT NULL,              -- sha-256 of the raw token
  kind        ENUM('self_service','approval','restore')
                           NOT NULL DEFAULT 'self_service', -- drives the TTL (R-AUTH-10);
                                                            -- restore lasts as self_service (ADR 0032)
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

### invites (QR auto-approval, R-INV-1..12)

```sql
CREATE TABLE invites (
  id           CHAR(36)     NOT NULL PRIMARY KEY,
  token        VARCHAR(64)  NOT NULL,              -- stored in clear: see note
  label        VARCHAR(120) NOT NULL,              -- "Summit 2026 — main stage"
  valid_from   DATETIME     NOT NULL,
  valid_until  DATETIME     NOT NULL,
  max_uses     INT          NOT NULL,
  uses         INT          NOT NULL DEFAULT 0,
  revoked_at   DATETIME     NULL,
  created_by   CHAR(36)     NOT NULL,              -- admin, for audit
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_invites_token (token),
  CONSTRAINT fk_invite_creator FOREIGN KEY (created_by) REFERENCES members(id)
);
```

**Why the token is not hashed.** Magic-link tokens are per-person secrets and are
stored hashed (R-NFR-5). An invite token is the opposite: it is printed on a
poster in a room full of people. Hashing a value that is on display buys nothing,
and it would stop the admin screen from re-rendering the QR code — which is an
operational requirement (R-INV-9). Its security comes from the window, the cap,
and revocation, not from secrecy (ADR 0014).

A token is **usable** when: `revoked_at IS NULL`, `NOW()` is between `valid_from`
and `valid_until`, and `uses < max_uses`. Any other state is inert and the visitor
falls through to the ordinary applicant flow (R-INV-5). `uses` increments only when
an invite actually admits a **new** member — not on a link request for an address
that already exists, so a typo cannot burn a seat.

Members admitted this way carry `joined_via_invite_id`, which is what makes a bad
batch identifiable and removable afterwards (R-INV-8, R-NFR-7).

### cases (seed, static)

```sql
CREATE TABLE cases (
  id        BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  trend_id  CHAR(2)      NOT NULL,
  org       VARCHAR(120) NOT NULL,
  url       VARCHAR(400) NOT NULL,
  takeaway  VARCHAR(400) NOT NULL,
  UNIQUE KEY uq_case_trend_url (trend_id, url),     -- the seed's natural key
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
  CONSTRAINT fk_challenge_member FOREIGN KEY (member_id) REFERENCES members(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_challenge_trend  FOREIGN KEY (trend_id)  REFERENCES trends(id),
  CONSTRAINT fk_challenge_auto_trend FOREIGN KEY (auto_trend) REFERENCES trends(id)
);
```

A member's challenges, expertise and follows reference them with `ON DELETE
CASCADE`, so deleting a member removes what they wrote with them (R-NFR-7,
F11).

### member_expertise ("been there" supply)

A member signals the trends they can help on (from offering help / their
profile). Populates "Been there" lists.

```sql
CREATE TABLE member_expertise (
  member_id CHAR(36)     NOT NULL,
  trend_id  CHAR(2)      NOT NULL,
  note      VARCHAR(400) NULL,
  PRIMARY KEY (member_id, trend_id),
  CONSTRAINT fk_exp_member FOREIGN KEY (member_id) REFERENCES members(id)
    ON DELETE CASCADE,
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
  requester_seen_at DATETIME NULL,                 -- requester opened the accepted contact (R-CONN-7)
  target_seen_at DATETIME NULL,                    -- target opened it: at once when they accepted (R-CONN-9)
  pending_key   VARCHAR(110) AS (IF(status = 'pending',
                  CONCAT(requester_id, ':', target_id, ':',
                         COALESCE(challenge_id, '-')), NULL)) VIRTUAL,
  KEY ix_req_target (target_id, status),
  KEY ix_req_requester (requester_id),
  UNIQUE KEY uq_pending (pending_key),     -- one pending request per pair and challenge (R-CONN-5)
  CONSTRAINT fk_req_requester FOREIGN KEY (requester_id) REFERENCES members(id),
  CONSTRAINT fk_req_target    FOREIGN KEY (target_id)    REFERENCES members(id)
);
```

Emails are **never stored on the request**. They are resolved by joining to
`members` only when `status='accepted'` and the viewer is one of the two parties.

`pending_key` holds a value only while a request is pending, so its unique index
makes the database refuse a second pending request between the same two members
about the same challenge, or about none, however close the race. An answered
request clears it and does not block a later one: R-CONN-5 forbids duplicate
_pending_ requests only.

### follows

```sql
CREATE TABLE follows (
  member_id CHAR(36) NOT NULL,
  trend_id  CHAR(2)  NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (member_id, trend_id),
  CONSTRAINT fk_follow_member FOREIGN KEY (member_id) REFERENCES members(id)
    ON DELETE CASCADE,
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
  PRIMARY KEY (member_id, challenge_id, action),
  CONSTRAINT fk_swipe_member FOREIGN KEY (member_id) REFERENCES members(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_swipe_challenge FOREIGN KEY (challenge_id) REFERENCES challenges(id)
    ON DELETE CASCADE
);
```

The deck reads it too: a challenge the viewer has any swipe on is never dealt
again (R-OFF-2).

### deck_views (activity record — R-STAT-1..4, ADR 0033)

One row per showing of a card in a member's swipe deck. Never read back by any
endpoint; it exists for statistics decided later (R-STAT-2).

```sql
CREATE TABLE deck_views (
  id           CHAR(36) PRIMARY KEY,
  member_id    CHAR(36) NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  challenge_id CHAR(36) NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  seen_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_view_challenge ON deck_views (challenge_id);
CREATE INDEX ix_view_member ON deck_views (member_id);
```

### outbox (every outbound message, every environment — R-MSG-1..7)

```sql
CREATE TABLE outbox (
  id          CHAR(36)     NOT NULL PRIMARY KEY,
  member_id   CHAR(36)     NULL,                 -- when known, for erasure (R-MSG-6)
  about_member_id CHAR(36) NULL,                 -- a member the body quotes (R-MSG-6)
  to_email    VARCHAR(320) NOT NULL,
  kind        ENUM('magic_link','approval','connection_request',
                   'admin_notice','connection_accepted','connection_added')
                           NOT NULL,
  subject     VARCHAR(255) NOT NULL,
  body_text   TEXT         NOT NULL,             -- credential redacted outside dev
  body_html   TEXT         NULL,
  status      ENUM('recorded','sent','suppressed','failed')
                           NOT NULL DEFAULT 'recorded',
  error       VARCHAR(500) NULL,                 -- transport's reason, no credential
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at     DATETIME     NULL,
  INDEX ix_outbox_created (created_at),
  INDEX ix_outbox_to (to_email),
  INDEX ix_outbox_status (status),
  CONSTRAINT fk_outbox_member FOREIGN KEY (member_id)
    REFERENCES members(id) ON DELETE CASCADE,
  CONSTRAINT fk_outbox_about FOREIGN KEY (about_member_id)
    REFERENCES members(id) ON DELETE CASCADE
);
```

This is a permanent domain table, not a development artifact. Outbound email is
otherwise unobservable: nobody can look in the recipient's inbox, and "did it
actually go out?" is the first question anyone asks when a magic link does not
arrive.

**The write order matters.** Record first with `status='recorded'`, hand the
message to the transport, then update to `sent`, `suppressed` or `failed`. A crash
mid-send leaves evidence of the attempt instead of a silent gap (R-MSG-2).

**Redaction (R-MSG-4).** The mailer knows the token it injected, so before storing
it replaces that exact string with a placeholder — everywhere except a
development deployment with delivery off, where the link stays clickable because
nothing leaves the machine (R-DEV-1). Without this, `outbox:read` would be the strongest permission in the
system: an admin could read any member's magic link and sign in as them.

`ON DELETE CASCADE` on `member_id` is what makes erasure one transaction
(R-NFR-7). `member_id` is null for messages to an address that never became a
member — an admin notice about an unknown applicant, say — and those age out under
retention rather than erasure. `about_member_id` names the member a body quotes:
a request email carries its requester's name and note, so erasing the requester
erases the email in the target's log as well.

**Retention is a job, not an endpoint (R-MSG-6).** The server deletes entries
older than `limits.outboxRetentionDays` once at startup and then every
`outboxPurgeIntervalHours`. Nobody can purge the log by hand: a person able to
read it should not also be able to erase the record of what was sent.

The same interval runs the **erasure sweep** (ADR 0032): every member with
status `deleted` whose `erase_after` has passed is erased as
`DELETE /api/admin/members/:id?now=true` does. One that cannot be erased (an
invite link made since, say) stays deleted and is tried again next time.

---

### setting_overrides (values hosts set in the app — R-CFG-6, ADR 0031)

```sql
CREATE TABLE setting_overrides (
  key         VARCHAR(64)  NOT NULL PRIMARY KEY,  -- e.g. 'abuse.applicantsCeiling'
  value       INTEGER      NOT NULL,
  changed_by  CHAR(36)     NULL,                  -- set null when that member is erased
  changed_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_override_member FOREIGN KEY (changed_by)
    REFERENCES members(id) ON DELETE SET NULL
);
```

A row overrides the environment for its key; no row means the deployment's
value. Only the keys R-CFG-6 names are accepted, so the table can never hold a
secret.

## 3. API

All `/api/*` routes, the admin API under `/api/admin/*` included, require an
authenticated session and a member with `status='active'` and completed
onboarding (except the onboarding routes). One server-side guard enforces this before any
route runs (R-ROLE-5, R-NAV-7): nobody signed in → `401`; signed in but not yet
onboarded → `403 {error: 'onboarding_required'}`. Only `/api/health` and
`/api/config` are open, since they carry nothing about anyone (R-CFG-2).

### Auth

| Method | Path                 | Body                               | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------ | -------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/auth/request-link` | `{email, next?, invite?, altcha?}` | If whitelisted active member → create token, send link (recorded always, delivered per `mail.delivery`), return the "check your email" state. If unknown email **with a usable `invite`** → create the member active with the `member` role, record `joined_via_invite_id`, increment `uses`, send the link (R-INV-1). If unknown email without a usable one → create `applicant`, notify admin, return the access-requested state, flagging whether an invite was refused so the client can show the notice (R-AUTH-2, R-INV-5). A pending applicant asking again gets the access-requested state with no second notice; a rejected one gets the not-approved state, no link and no notice (R-AUTH-13). An account set to be deleted gets the check-email state, exactly as an active member does, so the answer reveals nothing about the deletion. If the member deleted it themselves, the email it sends says when the account will be erased and carries a link to keep it, a magic link of kind `restore` that restores the account before signing in; if a host deleted it, nothing is sent (ADR 0032). The states differ deliberately — see ADR 0013. Within the abuse limits of §8 (R-NFR-8): past the per-address link-email allowance or the per-IP applicant cap it answers `{state: 'human-check', challenge}` until resent with a solved `altcha` payload; past the per-IP backstop or the applicant ceiling, `429`. |
| POST   | `/auth/verify`       | `{token}`                          | Validate the token (unexpired, unused), consume it, create the session and answer `{next}`: the validated `next` path stored with the token, else `/` (R-AUTH-5, R-NAV-5, R-NAV-6). A dead token answers 400 `{reason}` (`expired`, `used`, `unknown`) for R-AUTH-6; once the purge of ADR 0034 has removed a used or expired token, it answers `unknown`, which R-AUTH-6 treats the same.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| POST   | `/auth/logout`       | —                                  | Destroy session.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| GET    | `/auth/me`           | —                                  | Current member + onboarding/consent status + `roles[]` and resolved `permissions[]` (R-ROLE-4), and `analyticsOptIn` (R-ANA-4).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| POST   | `/auth/applicant`    | `{handle, name?, org?}`            | Attach applicant-supplied name/org to the pending request, for the host (R-AUTH-11,12). Pending applicants only; no session required, keyed by the request: the access-requested answer to the `request-link` that records the applicant carries a `handle` (a repeat request carries none, since anyone can make it), the address with its HMAC under the session secret and its own purpose label, and only that handle can describe the request — knowing someone's email is not enough. An unknown handle or a request no longer pending → `404`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| GET    | `/api/config`        | —                                  | Client-relevant limits + current consent version (R-CFG-2). No secrets.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

### Onboarding

| Method | Path                | Body                                                                                | Behavior                                                                                                                                                                                                                                                                                                           |
| ------ | ------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/api/onboarding`   | —                                                                                   | The form pre-filled: the member's profile so far, with `requested_name`/`requested_org` filling a missing name or organization (F2, R-AUTH-12), and the consent version in force. Pre-filling never stores them.                                                                                                   |
| POST   | `/api/onboarding`   | `{name, jobTitle?, org?, sector?, companySize?, consentVersion, analyticsVersion?}` | Set name/profile, record consent version + timestamp. Required before other `/api` routes. A `consentVersion` other than the current one → `409` (R-ONB-4). `analyticsVersion` is sent only when the analytics box is ticked and records the opt-in; one other than the current analytics words → `409` (R-ANA-4). |
| PUT    | `/api/me/analytics` | `{optIn: true, version}` or `{optIn: false}`                                        | Give or withdraw the analytics opt-in from the profile screen, as easily as at onboarding. A `version` other than the current analytics words → `409` (R-ANA-4).                                                                                                                                                   |
| GET    | `/api/profile`      | —                                                                                   | The member's own name, job title, organization, sector, company size, email (read-only), the consent version and time they accepted, and `analyticsOptIn` (R-PROF-1,2).                                                                                                                                            |
| PUT    | `/api/profile`      | `{name, jobTitle?, org?, sector?, companySize?}`                                    | Update the profile within the onboarding limits and lists; a blank or left-out optional field clears it (R-PROF-1).                                                                                                                                                                                                |
| DELETE | `/api/me/history`   | —                                                                                   | Delete the member's own deck views, nothing else (R-STAT-4). Answers `204`.                                                                                                                                                                                                                                        |
| DELETE | `/api/profile`      | —                                                                                   | Delete the member's own account as `DELETE /api/admin/members/:id` does: deactivate now, erase after the grace period; then end the session (R-PROF-2, ADR 0032). Refused with 409 `last_admin` or `created_invites`, as there. Answers `{eraseAfter}`.                                                            |
| POST   | `/api/events`       | `{event, props}`                                                                    | The UI events of §7 (`journey_chosen`, `feedback_opened`) with their listed properties only; anything else → `400`. Forwarded to Mixpanel only for a member opted in; always `204` otherwise, so the client cannot tell (ADR 0026).                                                                                |

### Ask journey

| Method | Path                          | Body        | Behavior                                                                                                                                                                                                |
| ------ | ----------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/trends`                 | —           | The 8 trends with `short`, `from` and `peers`, for the domain screen and the picker (R-ASK-6).                                                                                                          |
| GET    | `/api/trends/:trendId`        | —           | One trend with its curated case studies, for the trend screen (S9); no member appears. `404` for an id outside the eight.                                                                               |
| POST   | `/api/challenges`             | `{body}`    | Create challenge (more than `limits.challengeMinChars` − 1 characters, trimmed), run matcher, return challenge with `autoTrend` (R-ASK-3,4,5). _Requires `challenge:create`._                           |
| GET    | `/api/challenges/:id`         | —           | The author's own challenge; `404` for anyone else (R-NAV-8).                                                                                                                                            |
| PATCH  | `/api/challenges/:id`         | `{trendId}` | Confirm/override trend; set `overridden` if it differs from `autoTrend`. Author only.                                                                                                                   |
| GET    | `/api/challenges/:id/matches` | —           | `{trend, sameBoat[], beenThere[], cases[]}` for the confirmed trend, else the matched one; peers are other active, onboarded members, never the author, with no email (R-ASK-8, R-CONN-6). Author only. |

### Offer journey

| Method | Path             | Body                           | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------ | ---------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/api/deck`      | —                              | Next challenges to swipe (exclude own, exclude already-swiped).                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| POST   | `/api/swipe`     | `{challengeId, action, note?}` | Record the swipe on someone else's active challenge (own or gone → `404`). `same_boat`/`been_there` ask its author through the double opt-in (§connect), `been_there` with a note longer than `limits.beenThereNoteMinChars` − 1 characters (R-OFF-4); `follow` follows its trend; `skip` only records. A request already pending comes back as `{connection: {result: 'exists', id}}` (R-CONN-5), one to a member already connected as `{connection: {result: 'joined', id}}` (R-CONN-8). _Requires `challenge:swipe`._ |
| POST   | `/api/deck/seen` | `{challengeId}`                | Record that the card became the visible one in the deck (R-STAT-1): `204`. A challenge that is the member's own, inactive or unknown → `404`, nothing recorded. Answers nothing else; no endpoint reads views back (R-STAT-2). _Requires `challenge:swipe`._                                                                                                                                                                                                                                                             |

### Connections (double opt-in)

| Method | Path                           | Body                                       | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------ | ------------------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/connections`             | `{targetId, challengeId?, kind, message?}` | Create a pending request to an active, onboarded member other than oneself; a `challengeId` must belong to one of the two. **No email revealed.** A request already made from this requester to this target about this challenge → `409 {result: 'exists', id}` (R-CONN-1, R-CONN-5). Between members already connected, it is accepted at once and the target emailed a link to the contact → `200 {result: 'joined', id}`; about a challenge they are already connected over, nothing is added and that request's id comes back (R-CONN-8,9). |
| GET    | `/api/connections/incoming`    | —                                          | Pending requests addressed to me, with the requester's card, note and challenge, no email (R-MINE-2, R-CONN-2).                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| GET    | `/api/connections/connected`   | —                                          | Accepted requests I am a party to, either side, newest first: the other member's card, no email, and `unseen` while I have not opened its contact since it was accepted without me (R-MINE-5, R-CONN-7,9). The screen lists each other member once (R-MINE-5,6).                                                                                                                                                                                                                                                                                |
| GET    | `/api/connections/:id`         | —                                          | The request as one of its two parties sees it: direction, status, the other member's card, note and challenge, no email. Anyone else → `404`.                                                                                                                                                                                                                                                                                                                                                                                                   |
| POST   | `/api/connections/:id/accept`  | —                                          | Target only, pending only: mark accepted, seen by the target (R-CONN-3), accept every other request pending between the two, either side (R-CONN-11), and email the requester a link to the contact once (R-CONN-7). Anyone else, or a request already answered → `404`.                                                                                                                                                                                                                                                                        |
| POST   | `/api/connections/:id/decline` | —                                          | Target only, pending only: mark declined; emails stay private for good (R-CONN-4).                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| GET    | `/api/connections/:id/contact` | —                                          | If accepted and I'm a party → the other member's name, email, a prefilled mailto and `over`: every accepted request between us, as `/connected` shows them (R-CONN-10). The read then marks them all seen for me (R-CONN-7,9). Anything else → `404`, never `403` (ADR 0004, R-NAV-8).                                                                                                                                                                                                                                                          |

### Follow

| Method | Path                    | Behavior            |
| ------ | ----------------------- | ------------------- |
| POST   | `/api/follows/:trendId` | Follow a trend.     |
| DELETE | `/api/follows/:trendId` | Unfollow.           |
| GET    | `/api/follows`          | My followed trends. |

Follow returns `204`, or `404` for a trend that does not exist; following twice
or unfollowing what is not followed changes nothing.

### Cockpit

| Method | Path           | Behavior                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/cockpit` | `{challenges[], following[], pendingIncoming, newConnections}`: my active challenges with same-boat / been-there / case-study counts counted as the matches view lists them, my followed trends, how many requests wait for me, and how many accepted requests I have not opened yet, which together badge the nav (R-MINE-1,3,4, R-CONN-7,9). The requests themselves come from `/api/connections/incoming`. |

### Admin (permission-guarded, not role-name-guarded — R-ROLE-3)

| Method | Path                                 | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------ | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/admin/applicants`              | List pending applicants with email, request time, and any name/org given (R-AUTH-11). _Requires `applicant:review`._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| POST   | `/api/admin/applicants/:id/approve`  | Set `status='active'`, grant the `member` role, **and email a magic link** with the approval TTL (R-AUTH-10). _Requires `applicant:review`._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| POST   | `/api/admin/applicants/:id/reject`   | Set `status='rejected'`. _Requires `applicant:review`._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| POST   | `/api/admin/whitelist`               | Pre-approve addresses: `{emails}` (1 to `limits.whitelistBatchMax`, trimmed and lowercased). In one transaction, a new address becomes an active member with the `member` role and no name or consent, so they still onboard (R-ONB-3), and is not emailed; a pending applicant is admitted exactly as an approval would, and then emailed a magic link with the approval TTL (R-AUTH-3, R-AUTH-10); an active member is left alone; a rejected or deleted one is kept out, since re-admitting is decided per person (R-AUTH-3). Answers each address's outcome: `added`, `admitted`, `link_failed` (admitted, but the email failed), `already_active` or `kept_out`. A bad address fails the whole request with 400. _Requires `whitelist:manage`._ |
| POST   | `/api/admin/members/:id/roles`       | Grant a role: `{role}`. Records `granted_by` (R-ROLE-7, R-ROLE-9). Unknown role → 400; inactive or unknown member → 404. _Requires `role:grant`._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| DELETE | `/api/admin/members/:id/roles/:role` | Revoke a role. Refused with 409 if no active member would still hold `role:grant` (R-ROLE-9). _Requires `role:grant`._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| GET    | `/api/admin/members`                 | Every member with email, name, job title, organization, sector, status, roles and join time, by email (R-MEM-1, R-NFR-7). _Requires `member:delete`._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| GET    | `/api/admin/members/:id`             | One member's page: everything in the list, plus when they accepted which consent version, the analytics opt-in, the invite they joined through, and their numbers of challenges and connection requests sent and received (R-MEM-2). Unknown → 404. _Requires `member:delete`._                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| DELETE | `/api/admin/members/:id`             | Delete a member (ADR 0032): status `deleted`, sessions ended, `erase_after` set `limits.erasureGraceDays` ahead, and the former status kept for an undo; answers `{eraseAfter}`. With `?now=true`, the GDPR erasure in one transaction instead: the member, their roles, tokens, challenges, expertise, follows, swipes, requests on either side, sessions and outbound log entries (R-NFR-7, R-MSG-6). Unknown member → 404; refused with 409 `created_invites` while invites they made remain, and 409 `last_admin` if no active member would still hold `role:grant` (R-ROLE-9). _Requires `member:delete`._                                                                                                                                      |
| POST   | `/api/admin/members/:id/restore`     | Undo a deletion before it is erased: the former status back, `erase_after` cleared (ADR 0032). A member not set to be deleted → 404. _Requires `member:delete`._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| GET    | `/api/admin/outbox`                  | The outbound message log, newest first, filterable by recipient and status (R-MSG-5). Bodies have the credential redacted outside development (R-MSG-4). _Requires `outbox:read`._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| GET    | `/api/admin/settings`                | The configuration in groups, each value with its name, explanation, unit, and whether it differs from the default or is fixed in code; no secret (R-CFG-5). Each changeable setting also carries its bounds and, when set in the app, who set it, when, and the deployment value (R-CFG-6). _Requires `settings:read`._                                                                                                                                                                                                                                                                                                                                                                                                                              |
| PUT    | `/api/admin/settings/:key`           | Set a changeable setting: `{value}`, an integer. Out of bounds or out of order with its pair → 400; a key not changeable → 404. Takes effect at once here and on other servers within `settingsRefreshSeconds` (ADR 0031). _Requires `settings:manage`._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| DELETE | `/api/admin/settings/:key`           | Go back to the deployment value: deletes the override. _Requires `settings:manage`._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| GET    | `/api/admin/invites`                 | List invites with label, window, uses/cap, state, creator, and each one's join URL, so the QR can be re-rendered (R-INV-9). _Requires `invite:manage`._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| POST   | `/api/admin/invites`                 | Create an invite: `{label, validFrom?, validUntil?, maxUses?}`; a missing window or cap takes `limits.inviteDefaultHours` / `inviteDefaultMaxUses` from now. Returns it with its join URL, for the QR (R-INV-9,10). A window that ends before it starts → `400 bad_window`. _Requires `invite:manage`._                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| POST   | `/api/admin/invites/:id/revoke`      | Set `revoked_at`; effective on next use (R-INV-3). _Requires `invite:manage`._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

---

## 4. Screens and their URLs

The screen count is **not fixed** — the ten in the prototype were a rough guess
(R-NAV-3), and anything that deserves its own address gets its own screen.

**Screens, not modals.** Every step that holds content, takes input, or is worth
linking to is a full screen with a URL (R-NAV-1, R-NAV-2, R-NAV-4). Overlays are
reserved for interactions too small to link to: a destructive-action confirm, a
toast, an inline validation hint. Nothing that a member might want to send
someone, bookmark, or reload lives in a modal.

Each screen is addressable; the server serves the SPA for any unmatched GET so a
deep link reloads cleanly.

| #   | Screen                                                                                                                                                                                                                                                                                                            | URL                                                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| S1  | **Login** — email field → "check your email"                                                                                                                                                                                                                                                                      | `/login`                                                |
| S2  | **Sign in** — the magic link's landing: a **Sign in** button; tapping it verifies the token and routes onward (ADR 0027)                                                                                                                                                                                          | `/sign-in#token=…`                                      |
| S3  | **Onboarding** — name + consent (first time only)                                                                                                                                                                                                                                                                 | `/onboarding`                                           |
| S4  | **Welcome** — two doors: _Ask for help_ / _Offer help_                                                                                                                                                                                                                                                            | `/welcome`                                              |
| S5  | **Submit challenge** — textarea + read-only example hints; disabled until the text passes `limits.challengeMinChars`                                                                                                                                                                                              | `/ask`                                                  |
| S6  | **Domain / trend** — detected trend, "from → to", peer line, confirm                                                                                                                                                                                                                                              | `/challenges/:id`                                       |
| S7  | **Trend picker** — all 8 trends, pick a different one _(was a sheet)_                                                                                                                                                                                                                                             | `/challenges/:id/trend`                                 |
| S8  | **Matches (for my challenge)** — posted banner; rebels facing this now / who've been there / organizations that did it; follow; connect                                                                                                                                                                           | `/challenges/:id/matches`                               |
| S9  | **Trend detail & case studies** — the trend's "from → to", peers, curated cases _(was a sheet)_                                                                                                                                                                                                                   | `/trends/:trendId`                                      |
| S10 | **Swipe deck** — card stack; Same boat / Been there / Follow / skip                                                                                                                                                                                                                                               | `/offer`                                                |
| S11 | **"Been there" note** — write the ≥`limits.beenThereNoteMinChars` note for one card _(was a sheet)_                                                                                                                                                                                                               | `/offer/:challengeId/note`                              |
| S12 | **Connection request** — who, which challenge, optional message, send _(was a confirm modal)_                                                                                                                                                                                                                     | `/challenges/:challengeId/connect/:memberId`            |
| S13 | **Request sent** — "waiting for them", no contact detail                                                                                                                                                                                                                                                          | `/matches/requests/:id` (pending state)                 |
| S14 | **Matches cockpit** — incoming requests, my connections (one card per member, new ones first and outlined, R-MINE-6), my challenge(s) with counts, followed trends                                                                                                                                                | `/matches`                                              |
| S15 | **Incoming request** — the request with Accept / Decline _(was a cockpit modal)_                                                                                                                                                                                                                                  | `/matches/requests/:id`                                 |
| S16 | **Contact exchanged** — the other member's email + prefilled mailto, and what you are connected over (R-CONN-10), accepted requests only _(was a modal)_                                                                                                                                                          | `/matches/requests/:id/contact`                         |
| S17 | **Empty deck** — session summary + "submit your own challenge"; hosts the R-OFF-6 easter egg                                                                                                                                                                                                                      | `/offer/done`                                           |
| S18 | **Not found / no access** — generic, reveals nothing (R-NAV-8)                                                                                                                                                                                                                                                    | any unresolved path                                     |
| S19 | **Admin approvals** — applicant list with approve/reject                                                                                                                                                                                                                                                          | `/admin/applicants`                                     |
| S20 | **Outbound message log** — every message sent, with type, status, times and errors; magic links clickable in development only                                                                                                                                                                                     | `/admin/outbox`                                         |
| S21 | **Access requested** — what happens next, an optional name/org so the host can find them, and the "invitation link is not valid" notice when one was refused (R-AUTH-9, R-AUTH-12, R-INV-5)                                                                                                                       | `/access-requested`, `/access-requested?invite=invalid` |
| S22 | **Admin invites** — invite links with label, window, uses/cap, state; create, revoke, and the join URL / QR to display (R-INV-9)                                                                                                                                                                                  | `/admin/invites`                                        |
| S23 | **Admin members** — member cards (name; job title · organization · sector; email, roles, status), searchable; tap a card's selector or hold the card to choose several; selected cards are outlined; a bar above the list, staying at the top while scrolling, gives or takes a role, or deletes them (R-MEM-1,3) | `/admin/members`                                        |
| S26 | **A member's page** — everything held about one member; change their roles, delete them, and for a deleted account the erasure date with restore and erase-now (R-MEM-2, ADR 0032)                                                                                                                                | `/admin/members/:id`                                    |
| S24 | **Profile & privacy** — edit name, job title, organization, sector and company size, each saved on change with a tick; the accepted consent, read-only with version and date; the analytics opt-in; how to leave (R-PROF-1,2)                                                                                     | `/profile`                                              |
| S25 | **Settings** — every configured value in named groups such as Spam protection, marking what differs from the default; the values R-CFG-6 allows are fields saved on change with a tick, with who changed them and a way back to the deployment value (R-CFG-5,6)                                                  | `/admin/settings`                                       |

Remaining overlays, deliberately: the "really decline this request?" confirm, the
"link sent" / "copied" toasts, and the feedback action (a `mailto:`, not a
screen). Everything else above is linkable — which is exactly what makes the
notification emails in R-NAV-9 useful.

**Removed vs prototype:** standings/badges screen, milestone pop-ups, CR theme
toggle, "nominate as frontier".

### Routing rules

The app is a Vue SPA (ADR 0017), so these rules exist on **both** sides: as
`vue-router` guards, and as server checks that hold regardless. **One route table**
(`src/routes.ts`) is imported by the client router and by the server's `next`
validator, so neither side can develop a private opinion about which paths exist.

- **The server is the authority.** Guards are a courtesy — they stop a flash of the
  wrong screen. Every `/api/*` request re-checks session, onboarding and permission
  on its own (R-ROLE-5). A guard that is the only thing protecting data is a defect.
- **Deep link while signed out** → the client remembers the path, routes to
  `/login`, and sends it as `next` on `POST /auth/request-link`. It is stored
  with the token, and the sign-in screen goes there once `POST /auth/verify` has
  created the session (R-NAV-5).
- **`next` validation happens on the server**, because it arrives in an email:
  accept only a path starting with a single `/` and present in the route table;
  anything else (absolute URL, `//host`, unknown path) falls back to `/`
  (R-NAV-6). The client refuses to navigate anywhere not in the table either.
- **Onboarding wins** — a guard sends an un-onboarded member to `/onboarding` and
  carries `next` through it; the server independently refuses every other `/api/*`
  route until onboarding is complete (R-NAV-7, R-ONB-1).
- **Authorization before rendering** — a screen for a challenge or request fetches
  it first. The API answers `404` for anything the caller may not see, never `403`,
  so the client renders the not-found screen without ever learning the row exists
  (R-NAV-8).
- **The shell** is served `200` for any in-table path; unknown paths render the
  client's not-found screen.
- **Email links** point at `/matches/requests/:id` (incoming request) or
  `/matches`; never at a contact detail (R-NAV-9).
- The **QR code** encodes the app root, optionally with `?src=summit-qr` for the
  analytics funnel and `?invite=…` for auto-approval (R-NAV-10, R-INV-1; R-ANA-3 —
  no identifying data in either parameter).

---

## 5. Trend matching algorithm

Beta uses the prototype's deterministic keyword scorer (no LLM). Each trend has
**strong** keywords (weight 6) and **weak** keywords (weight 1). Score a
challenge's lowercased text against every trend; highest score wins; ties/no
match fall back to a default trend. The member can always override.

```js
// services/matcher.js
function detectTrend(text, trends) {
  const s = (text || '').toLowerCase()
  let best = null,
    bestScore = 0
  for (const t of trends) {
    let score = 0
    for (const k of t.keywords.strong) if (s.includes(k)) score += 6
    for (const k of t.keywords.weak) if (s.includes(k)) score += 1
    if (score > bestScore) {
      bestScore = score
      best = t
    }
  }
  return best || trends.find((t) => t.id === '06') // default: Distributed Decision Making
}
```

Post-beta upgrade (Could-have C5): replace with an LLM classifier that returns a
trend id + confidence; keep the same interface so callers don't change.

---

## 6. Seed data

Seeding is split into **profiles** so a dev deployment and production never share
fixtures. The profile is chosen by `SEED_PROFILE` (`dev` | `prod`), defaulting to
`dev`; the seed runner **refuses to load `dev` fixtures when `NODE_ENV=production`**
so fictional members can never reach the summit database, and **refuses the
`prod` profile in a development deployment** (R-SEED-8), so real attendees never
reach a server whose log keeps their sign-in links readable.

| Profile | Shared content (§6.1, §6.2) | Members / whitelist                                                                              | Challenges                               |
| ------- | --------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| `dev`   | yes + roles                 | fictional roster from the prototype (§6.3), consent pre-accepted, one seeded `admin`             | prototype example challenges (§6.3)      |
| `prod`  | yes + roles                 | real invited-attendee whitelist, loaded from a private file (§6.4); named admins granted `admin` | the ~15 real collected challenges (§6.4) |

Suggested layout under `/src/seed`:

```
seed/
  index.js            runner: reads SEED_PROFILE, guards against dev-in-prod
  shared/trends.js    the 8 trends (§6.1)      — both profiles
  shared/cases.js     case studies (§6.2)      — both profiles
  shared/roles.js     `member`, `admin` rows   — both profiles
  profile-options.ts  sectors, company sizes   — both profiles
  dev/people.js       fictional roster (§6.3)  — dev only
  dev/challenges.js   prototype examples       — dev only
  prod/load.js        reads whitelist + real challenges from env-pointed files
```

Seeding is **idempotent**: re-running upserts by natural key (trend number, case
URL, member email, sector and company size key) rather than duplicating rows.

### 6.1 The 8 trends

| id  | short                       | from                  | peers | strong keywords (weight 6)                                                                                                                | weak keywords (weight 1)                                                    |
| --- | --------------------------- | --------------------- | ----: | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 01  | Purpose & Values            | Profit                |    12 | purpose, values, mission statement, meaning                                                                                               | purpose, values, mission, meaning, culture fit, recruit, brand              |
| 02  | Network of Teams            | Hierarchical Pyramid  |    34 | org chart, shadow organi, shadow organis, middle management, network of teams, silo, reorg                                                | structure, hierarch, circle, team, silo, reorg, pyramid, shadow, department |
| 03  | Supportive Leadership       | Directive Leadership  |    27 | micromanag, leadership means, management position, coach, directive                                                                       | leader, manager, boss, command, let go, supervisor                          |
| 04  | Experiment & Adapt          | Plan & Predict        |    15 | budget cycle, annual budget, forecast, experiment, pilot, okr                                                                             | budget, plan, forecast, experiment, pilot, agile, roadmap                   |
| 05  | Freedom & Trust             | Rules & Control       |    21 | remote, hybrid, office days, vacation, working hours, four-day, approval                                                                  | trust, freedom, rule, policy, autonom, control, hours                       |
| 06  | Distributed Decision Making | Centralized Authority |    29 | who decides, who can decide, who actually can decide, decision-making, decision making, decision rights, mandate, advice process, consent | decision, decide, authority, mandate, consent, power, empower, escalat      |
| 07  | Radical Transparency        | Secrecy               |    18 | salary, salaries, pay model, compensation, remuneration, bonus, open book, transparen, wage                                               | transparen, salary, pay, compensation, financial, secret, reward, bonus     |
| 08  | Talents & Mastery           | Job Descriptions      |    23 | performance review, peer feedback, job description, job title, appraisal, promotion, career path, talent                                  | talent, job, review, feedback, career, promotion, development, mastery      |

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

### 6.3 Dev fixtures (`SEED_PROFILE=dev`, never in production)

Everything here comes from the prototype (`prototype/rebel-match-beta.html`) and
exists so a developer gets a populated app on first run — a non-empty swipe deck,
non-empty match lists, and a login that works without waiting for an email.

- **Fictional roster:** Marieke de Wit, Tobias Renner, Ana Ferreira, Jonas Brand,
  Priya Raman, Lars Petersen, Nadia Osei, Ruben Vos, Aline Dubois, plus
  challenge-authors Sanne Kuipers, Milan Horvat, Elena Marchetti, Ola Nyberg,
  Yusuf Kaya, Hanna Vogt, Diego Salas — with roles, orgs, sectors, trends, and
  either an experience note ("been there") or a challenge ("same boat").
- Fixture members are seeded **already onboarded** (name set, consent version +
  timestamp filled) so **F2** can be skipped while testing deeper screens.
- **Dev admin:** `admin@rebel-match.invalid`, onboarded, holding `member` and
  `admin`. It is who `npm run dev` prints a sign-in link for (R-DEV-6).
- **Dev whitelist:** the team's own addresses plus the fixture members, so
  magic-link login works against a dev mailbox.
- **Example challenges** from the prototype double as the R-ASK-2 "insert an
  example" content and as swipe-deck filler.
- Fixture emails use a non-routable domain (e.g. `@example.invalid`) so a
  misconfigured dev deployment cannot email a real person.

### 6.4 Production seed (`SEED_PROFILE=prod`)

Production starts with real content only — no fictional members, ever.

- **Attendee whitelist:** the invited summit attendees (R-AUTH-1), loaded from a
  private file pointed at by env (`SEED_WHITELIST_FILE`, e.g. a CSV of
  `email,name?`). Real addresses are **not committed to this repository**; the
  file is supplied at deploy time and the repo holds only a `.example` template
  (R-NFR-5).
- **The ~15 real collected challenges** (`SEED_CHALLENGES_FILE`), each with its
  trend assignment, so the swipe deck and match lists are non-empty the moment
  the first attendee scans the QR code. _(Meeting: "around 15 or so" real
  challenges already came in.)_
- Whitelisted attendees are seeded as **not yet onboarded**: they still go
  through **F1** and **F2** themselves, which is what records their consent
  (R-ONB-3, R-NFR-6). The seed never pre-accepts consent on someone's behalf.
- Attribution of the collected challenges is an open point — see requirements
  §11 open question 5.

---

## 7. Analytics (Mixpanel, EU residency, free tier)

**Chosen tool: Mixpanel.** It is what the team already had in mind, and its free
plan carries everything the beta needs:

- **Free tier:** up to 1M events/month and unlimited seats — orders of magnitude
  above summit scale (~350 members, thousands of events), so R-ANA-5 is met
  without a paid plan.
- **EU data residency:** selectable per project at **no extra cost and with no
  plan gate**, which satisfies the privacy posture directly rather than as a
  "SHOULD" (R-ANA-5, R-NFR-1).
- Funnels and retention are the core product, so the F1 → F2 onboarding funnel
  (`flows.md`) and the ask/offer split are first-class.

**EU residency setup — get this right the first time:**

- Choose **EU Data Residency** when _creating_ the project. The residency of a
  project cannot be changed afterwards; a wrong choice means creating a new
  project and abandoning the old data.
- Point every call at the EU endpoints, in both the client and server config —
  ingestion `api-eu.mixpanel.com`, queries `eu.mixpanel.com/api`. Data sent to
  the default US endpoints is stored in the US even for an EU project.

Alternatives considered (kept only as fallbacks):

- **PostHog** — comparable free tier with EU cloud and a self-host option. The
  fallback if Mixpanel's free-tier terms change before launch.
- **Umami / Plausible** — privacy-friendly and free (self-host) but oriented to
  pageview web analytics; weaker for event funnels/retention. Good fallback if
  only basic usage counts are needed.
- **Matomo / Countly (community)** — self-host, heavier to operate.

### Instrumentation rules (enforce R-ANA-2/3)

- Identify users by `members.analytics_id` (pseudonymous UUID), **never** email
  or name.
- Capture these events with non-identifying properties only:

  | event                  | properties                               |
  | ---------------------- | ---------------------------------------- |
  | `login_completed`      | —                                        |
  | `onboarding_completed` | `consent_version`, `seconds_to_onboard`? |
  | `journey_chosen`       | `journey: ask\|offer`                    |
  | `challenge_submitted`  | `char_count`                             |
  | `trend_assigned`       | `trend_id`, `overridden: bool`           |
  | `swipe`                | `action`, `trend_id`                     |
  | `connection_requested` | `kind`                                   |
  | `connection_responded` | `status: accepted\|declined`             |
  | `feedback_opened`      | `screen`                                 |

- `seconds_to_onboard` is `consent_at` minus the time the latest sign-in email
  (`outbox` kind `magic_link`) to the member was recorded, in whole seconds
  (R-NFR-3). It covers email delivery, signing in and the onboarding screen; the
  scan and typing the address come before it and are timed by hand. It is left
  out when no such email is in the log, for instance after its retention.
- **Never** send challenge `body`, member `name`, `email`, `org`.
- **Opt-in only** (R-ANA-4, ADR 0026). Onboarding shows an unticked checkbox
  under the consent, with its own versioned words (`analyticsTexts`, like
  `consentTexts`). Ticking it sets `analytics_consent_version` and
  `analytics_consent_at`; the member changes it later on the profile screen
  (`PUT /api/me/analytics`, R-PROF-2). An event is sent only while both are set.
- **Server only.** The server sends every event through the Mixpanel HTTP
  ingestion API at `analytics.apiHost` (`api-eu.mixpanel.com`). The two UI
  events, `journey_chosen` and `feedback_opened`, are posted by the client to
  `POST /api/events`, which accepts only those names with their listed
  properties. No Mixpanel script, cookie or device identifier is in the browser,
  and the token never leaves the server.
- `invite_rejected` is not captured: a visitor turned away has not onboarded,
  so cannot have opted in.
- A failed send never fails the request it describes; it is reported without
  personal data and dropped. Without `MIXPANEL_TOKEN` nothing is sent.

---

## 8. Security & privacy notes

- Magic-link tokens: generate 32 bytes random, email the raw token, store only
  its SHA-256. Single-use, expiry from `limits.magicLinkTtlMinutes` (default
  15).
- **Abuse limits (R-NFR-8, ADRs 0029, 0030).** In-memory counters per server
  instance, reset on restart:
  - per address per `abuse.linkEmailWindowMinutes` (15), link emails past
    `abuse.linkEmailsBeforeCheck` (3) need a solved ALTCHA payload, answered
    `{state: 'human-check', challenge}` until then (ADR 0030); past
    `abuse.linkEmailsCeiling` (10), `/auth/request-link` answers as usual
    and sends nothing;
  - per IP, `abuse.authRequestsPerIp` (1000) per `abuse.ipWindowMinutes`
    (15) across `POST /auth/request-link`, `/auth/applicant` and
    `/auth/verify`: over it, `429 too_many_requests`;
  - new applicants per IP per `abuse.applicantWindowMinutes` (60): after
    `abuse.applicantsBeforeCheck` (30) the request answers
    `{state: 'human-check', challenge}` until it is resent with a solved
    ALTCHA payload; after `abuse.applicantsCeiling` (300), `429`.
  - The ALTCHA challenge is HMAC-signed with a key derived from
    `SESSION_SECRET`, expires after `abuse.humanCheckMinutes` (5), and is
    accepted once; `abuse.humanCheckCost` (1000) sets the PBKDF2 work per
    try. The widget loads only when a check is asked for, with its
    interaction signature off.
  - The `abuse.*` values stay on the server: `GET /api/config` does not serve
    them, so a script cannot read how far it can go.
  - The client IP comes from `X-Forwarded-For` only through `TRUST_PROXY`
    hops (Express `trust proxy`); `0`, the default, uses the socket address.
- The login screen distinguishes a known address from an unknown one, so email
  enumeration is possible by design (ADR 0013). Rate-limiting is what keeps it
  from being cheap at scale; `/auth/request-link` is throttled per address and
  per IP.
- Sessions: http-only, `Secure`, `SameSite=Lax` cookie; server-side session store
  in the database. The cookie carries a random id and its HMAC under `SESSION_SECRET`;
  the `sessions` table stores only the id's SHA-256, like `magic_tokens`. Both
  live inside `auth/` rather than in `express-session` (ADR 0018).
  - Signing in ends the session the request presented before creating the new
    one, so a sign-in always starts a fresh session (ADR 0034).
  - Every `tokenPurgeIntervalHours` (1) the server deletes expired sessions and
    used or expired magic-link tokens (ADR 0034).
- **Production refuses a weak environment (ADR 0034).** With
  `NODE_ENV=production` the server does not start unless `PUBLIC_URL` is https,
  which makes the session cookie `Secure`, and `TRUST_PROXY` is at least 1, so
  the per-IP limits see each visitor rather than the proxy.
- **Security headers (ADR 0034)** on every response, through `helmet`:
  - Content-Security-Policy `default-src 'self'`, no inline script,
    `object-src 'none'`, `base-uri 'none'`, `form-action 'self'`,
    `frame-ancestors 'none'`, widened only for what the human-check widget is
    shown to need;
  - `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`;
  - HSTS for a year when `PUBLIC_URL` is https.
- A sign-in token travels only in the sign-in screen's URL fragment and the
  body of `POST /auth/verify`, never in a query string a log could keep
  (ADR 0027, ADR 0034).
- Authorization: every challenge/connection/contact read must check the caller is
  a party or owner. Contact endpoint returns an email **only** for an accepted
  request where the caller is one of the two members.
- Authorization is **permission-based**: one `requirePermission('…')` middleware
  checks the caller's permissions, resolved from their roles through the
  `PermissionPolicy` (ADR 0021). No route tests a role name, so a new role (e.g.
  `moderator`) cannot silently inherit or miss access (R-ROLE-3, R-ROLE-5).
  Nobody signed in gets `401`; a member without the permission gets `404`, as if
  the route did not exist — not found, never forbidden (R-NAV-8).
- Role grants are recorded with `granted_at` / `granted_by` for audit (R-ROLE-7).
- Deep links are not a capability: `next` is validated as a known in-app path
  (R-NAV-6) and the target screen still runs the same ownership checks as its API
  (R-NAV-8).
- Invite tokens (R-INV-1) are **public capabilities**, not secrets: they are
  printed on posters. Usability is re-checked server-side on every request —
  window, cap, `revoked_at` — and the result is never cached, or a revoked invite
  keeps admitting people. An unusable token degrades to the applicant flow, never
  to an error (R-INV-5). An invite grants the `member` role and nothing more.
- The outbound message log is a permanent admin surface, not a dev-only one
  (R-MSG-5). What production withholds is the **credential**, not the screen: the
  magic-link token is redacted from the stored body before it is written, so
  `outbox:read` cannot become a way to sign in as another member (R-MSG-4). The
  body keeps the link intact only where mail never leaves the machine (R-DEV-1).
- All secrets via env (`DATABASE_URL`, `SESSION_SECRET`, `SMTP_*`,
  `MIXPANEL_TOKEN`, `MIXPANEL_API_HOST=api-eu.mixpanel.com`).

---

## 9. Testing & CI

Tooling (R-QA-1..6). Language is **TypeScript, strict** (ADR 0011); commit and
branch rules are in ADR 0012 and `docs/constitution.md`.

- **Unit tests:** `vitest`, one `npm test` entry point. Pure modules (matcher,
  token service, permission resolver, `next` validator, config validation) are
  tested without a database — which is why services take their dependencies as
  arguments (constitution §4).
- **Integration tests:** `supertest` against the Express app with a disposable
  PGlite in memory, and in CI also against a real Postgres 17 service (below),
  with `mail.delivery=none`, so the auth flow
  is testable without sending mail — the outbox doubles as the test mailbox.
- **Types:** `tsc --noEmit`, `strict: true`, no implicit `any`, across server and
  client.
- **Component tests:** `@vue/test-utils` with jsdom for screens; the routing
  guards are written as pure functions so the deep-link rules (R-NAV-5..8) are
  unit-tested without a browser (ADR 0017).
- **Lint/format:** `eslint` + `prettier`, plus the mechanical constitution rules
  (`import/no-cycle`, `complexity`, `no-console`, `no-warning-comments`).
- **Commits:** `commitlint` with the Conventional Commits config.
- **Hooks:** a pre-commit hook formats and lints **staged files** (lint-staged)
  and runs a **full** typecheck, since `tsc` is project-wide and cannot be
  scoped to a few files; a commit-msg hook runs commitlint. A pre-push hook
  runs lint, the unit tests, the integration tests when a database answers, and
  the reviewer agent (ADR 0019). The same checks run again in CI — the hooks
  are speed, CI is the gate.
- **Coverage:** 80% global floor, 90% branch coverage on the R-QA-1 modules.
  Modules whose only job is I/O (`db.ts`, the migration runner, the server entry)
  are excluded from the unit floor and covered by the integration suite instead.
  The exclusion has a rule, not a list: if a module holds a decision worth
  testing it does not belong on it — the decision belongs in a pure module
  (constitution §4).

`.github/workflows/ci.yml` — on `push` and `pull_request`:

```yaml
services:
  postgres:
    image: postgres:17
    env: { POSTGRES_PASSWORD: test, POSTGRES_DB: rebel_match_test }
    options: >-
      --health-cmd="pg_isready" --health-interval=5s --health-retries=10
steps:
  - npm ci
  - npm run lint
  - npm run typecheck # tsc --noEmit, strict (R-QA-1)
  - npx commitlint --from origin/main --to HEAD
  - npm test # unit (R-QA-1)
  - npm run migrate # from an empty database (R-QA-4)
  - npm run test:integration # API-level (R-QA-2)
```

A `build` job beside it builds the production image from the `Dockerfile` —
server (tsc) and client (vite), ADR 0017 — once per commit, and hands it to the
deploy job as an artifact, which pushes it rather than building again (ADR
0025).

- The workflow uses synthetic env only: a throwaway `SESSION_SECRET`,
  `mail.delivery=none`, `SEED_PROFILE=dev`, and **no** Mixpanel token. No
  production secret and no real attendee list is exposed to CI (R-QA-5,
  R-SEED-5).
- `main` must be green as part of the 2026-11-01 "feature-complete and tested"
  milestone (R-QA-6).
