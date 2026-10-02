# Rebel Match — Engineering Constitution

The rules every change obeys, whether a human or an agent wrote it. `AGENTS.md`
tells you how to work in this repo; this file tells you what "good" means.

**Changing this file requires an ADR.** Everything else here can be cited in a
review as grounds to reject a change.

---

## 1. Change size and commits

- **One change per commit.** One concern, one commit. If the subject line needs
  an "and", split it.
- **One change per pull request**, squash-merged. A PR a reviewer cannot hold in
  their head is too big — aim for something reviewable in ten minutes.
- **Conventional Commits**: `type(scope): subject`, imperative mood, ≤72 chars.
  Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `build`,
  `ci`. The body explains _why_, not what the diff already shows.
- Every PR cites the requirement it serves (`R-ASK-3`, `R-CONN-6`, …) and, for a
  major decision, the ADR that authorized it.
- **Never commit a change you have not run.** Tests pass locally before the
  push.
- Refactoring and behavior change do not share a commit. Separate them, always.

## 2. Tests

- **Every behavior change ships with its tests, in the same commit.** Not after,
  not "in a follow-up".
- A bug fix starts with the failing test that reproduces it.
- The modules named in R-QA-1 — trend matcher, magic-link tokens, permission
  resolver, double opt-in rules, `next` validation, config thresholds — are
  **pure and unit-tested without a database**. If testing one needs a database,
  the design is wrong, not the test.
- Integration tests cover the two multi-endpoint journeys: auth + onboarding,
  and the connection double opt-in (R-QA-2).
- Tests describe behavior, not implementation: rename a private helper and no
  test should break.
- No snapshot tests for logic. No mocks of our own code where a real object
  fits.
- **Coverage floor:** 80% global, 90% branch coverage on the R-QA-1 modules. The
  floor is a smoke alarm, not a goal — it fails the build, it does not prove
  anything.

## 3. Comments and documentation

- **No comments unless strictly necessary.** Necessary means: a non-obvious
  _why_, a workaround with a link, a deliberate deviation from this document.
- **Never comment what the code says.** If a comment is needed to explain what a
  block does, extract it into a named function instead.
- **One doc comment per exported function, class, or type — at most 300
  characters.** Purpose and contract only; no parameter lists that repeat the
  signature, no usage examples, no prose. Internal helpers get no doc comment;
  they get a better name.
- **No change history in source.** No author tags, no dates, no "modified by",
  no ticket numbers, no `// was: …`, no commented-out code. Git is the history,
  and it is better at it.
- **No TODO without an issue link.** An unlinked TODO is deleted on sight.
- Documentation that outlives a change goes in `specs/` (product) or `docs/`
  (engineering), never in a comment block.

## 4. Design

SOLID where it earns its keep — for this codebase that is mostly **S** and
**D**:

- **Single responsibility** — a module does one thing. `routes/` parses and
  responds, `services/` decides, `db/` persists. A route handler containing a
  business rule is a defect.
- **Dependency inversion** — services receive their dependencies (pool, mailer,
  clock, config) as arguments. No module reaches for a singleton or imports a
  live connection. This is what makes §2's database-free unit tests possible.
- **Pure core, I/O at the edges.** Decisions are pure functions over data; the
  edges do the talking to MySQL, SMTP, and Mixpanel.
- **Open/closed where variation is real** — the trend matcher sits behind an
  interface because an LLM replaces it post-beta (ADR 0010). Nothing else gets a
  plug-in point on speculation.
- **No speculative abstraction.** There is a November deadline. Two call sites
  do not justify a framework; the third one earns it.
- **No dead code.** Delete it — git remembers.
- **No circular imports**, and no module reaching up into its parent's siblings.
- Functions do one thing at one level of abstraction. If you are scrolling, it
  is too long.

## 5. Privacy and security (non-negotiable)

These exist because this app holds people's unsolved problems and their email
addresses. A change that weakens one is rejected regardless of what it enables.

- **Fail closed.** Authorization defaults to deny. A missing check is a denial,
  never an allow.
- **Permission names, never role names.**
  `requirePermission('applicant:review')`, never `if (member.isAdmin)`
  (R-ROLE-3, ADR 0006).
- **No contact detail leaves the server without an accepted connection** whose
  caller is one of the two parties (R-CONN-6, ADR 0004).
- **Not found, not forbidden.** An unauthorized read never confirms the row
  exists (R-NAV-8).
- **No PII in logs, errors, or analytics.** No email, name, or challenge text —
  ever, including in debug output and exception messages (R-ANA-3, R-NFR-1).
- **Validate at the boundary.** A schema per endpoint; the server re-checks
  everything the client checked (R-CFG-3).
- **No secrets in source, fixtures, or CI.** Configuration only (R-NFR-5,
  R-QA-5). A committed secret is rotated, not just removed.
- Dev fixtures use non-routable addresses so a misconfigured environment cannot
  email a real person (R-SEED-2).

## 6. Data and migrations

- **Migrations are forward-only.** Never edit a migration that has run anywhere;
  add another one.
- Every migration runs from an empty database in CI (R-QA-4).
- Schema changes are additive first: add, backfill, switch, then remove — in
  separate commits.
- No flags where an entity belongs. Today's `is_admin` is tomorrow's four
  booleans (ADR 0006).
- Names say what they mean. `job_title` is not `role`; the collision we already
  had cost a rename.

## 7. Configuration

- **No magic numbers at the use site.** Thresholds, timings, and limits come
  from the config module (R-CFG-1).
- Client and server read the same values; the server enforces them regardless
  (R-CFG-2, R-CFG-3).
- Behavior differences between environments are configuration, not branches in
  the code (R-DEV-4).

## 8. Decisions

- **Every major decision gets an ADR, before it lands.** Major means: hard to
  reverse, or a future maintainer will ask "why is it like this?" — a datastore,
  a vendor, an auth or access model, a URL scheme, a framework, a rule in this
  file.
- An ADR is one page: context, decision, consequences. See `docs/adr/README.md`.
- A decision not written down will be re-litigated. The commit message is not an
  ADR; it scrolls away.

## 9. What is mechanically enforced

Rules that run beat rules people remember. CI is the gate; the pre-commit and
pre-push hooks are the fast feedback (ADR 0019).

| Rule                                    | Enforced by                                            |
| --------------------------------------- | ------------------------------------------------------ |
| Commit message format                   | `commitlint` (hook + CI)                               |
| Formatting                              | `prettier --check` (hook + CI)                         |
| No commented-out code, no unlinked TODO | `eslint` (`no-warning-comments`, custom)               |
| Complexity and function length caps     | `eslint` (`complexity`, `max-lines-per-function`)      |
| No circular imports                     | `eslint-plugin-import` (`import/no-cycle`)             |
| No `console` in server code             | `eslint` (`no-console`)                                |
| Type safety                             | `tsc --noEmit`, strict mode, no implicit `any`         |
| Tests pass, coverage floor              | `vitest run --coverage` (pre-push hook + CI)           |
| Review against these rules              | reviewer agent, blocking at score 4 (pre-push hook)    |
| Migrations from scratch                 | CI job against a disposable MySQL                      |
| Secrets absent                          | CI uses synthetic config only; secret scanning on push |

Enforced by **review**, because no linter can judge them: change size, comment
necessity, the 300-character limit, naming, the privacy rules in §5, and whether
an abstraction earned its place.

---

_Last reviewed 2026-10-02. Amendments require an ADR._
