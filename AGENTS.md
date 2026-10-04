How to work in this repository. Read this first; it is short on purpose.

- **What this is** — Rebel Match: a peer-matching app for the Corporate Rebels
  network. Members post an organizational challenge and are matched with peers
  in the same boat, peers who have solved it, and curated case studies. Launches
  at a summit on **2026-11-08**, feature-complete **2026-11-01**.
- **The rules** — [`docs/constitution.md`](docs/constitution.md). Not optional,
  and citable in review.
- **What it must do** — [`specs/README.md`](specs/README.md) is the index.
- **Why it is like this** — [`docs/adr/`](docs/adr/README.md).
- **Getting magic links delivered** — [`docs/email-setup.md`](docs/email-setup.md),
  which is on the critical path for R-NFR-3.

## Repo map

```
specs/              the product spec — what must be true (read before coding)
  requirements.md   numbered requirements (R-*), EARS phrasing
  flows.md          every user journey end to end (F1–F14)
  design.md         architecture, schema, API, screens, matcher, seeds
  priorities.md     MoSCoW against the deadline
  tasks.md          milestones; each task cites its requirement
  prototype/        the original clickable prototype (seeds dev only)
docs/
  constitution.md   engineering rules
  adr/              architecture decision records
  email-setup.md    DNS and deliverability runbook (R-NFR-3, open question 4)
  cloud-setup.md    one-time Google Cloud and GitHub setup (ADR 0025)
src/                server + client (not yet created; M0 in tasks.md)
```

## How a change happens

1. **Find the requirement.** Every change serves an `R-*` id. If none covers it,
   the spec changes first — in its own commit.
2. **Check for a decision.** Major and not yet decided? Write the ADR before the
   code (constitution §8). Already decided? Follow it, or supersede it properly.
3. **Branch**, one change per branch, named `type/short-topic` with the
   Conventional Commit type of the change: `feat/auth-seam`,
   `docs/vue-spa-decision`, `chore/m0-toolchain`. A branch handed to you under
   another name is renamed before it is pushed.
4. **Write the test with the change**, same commit (§2).
5. **Open a PR** citing the requirement, and the ADR if there is one.
   Squash-merge.

Do not batch unrelated fixes. Do not land a refactor and a behavior change
together. If a change grows past what a reviewer can hold in their head, split
it.

### Before you push

The pre-push hook runs what CI would reject: lint, unit tests, the integration
suite when a database is reachable, and then the **reviewer agent**
(`.claude/agents/reviewer.md`) on everything the branch adds over `origin/main`.

The reviewer files each finding under a category, and the category fixes the
score (`scripts/review/config.json`): privacy or security 7, correctness 6, one
of the six below 5, a spec or ADR contradiction 4, a design rule 3, style 1. A
finding at **4 or above blocks the push**; lower ones are printed as advice. A
finding without a file, line, rule and failure scenario is discarded. Verdicts
are cached per diff, so pushing again without changes does not ask again.

Fix a blocking finding, or — if the reviewer is wrong — say why in the PR and
push with `--no-verify`. **Agents never use `--no-verify`**; they fix the
finding or stop and ask. Without the `claude` CLI the review is skipped with a
warning, and CI remains the gate for everything else.

### Merging

`main` takes squash merges of pull requests with CI's `check` green on their
own branch; the branch need not be up to date with `main` (ADR 0028). Who
presses the button depends on the change (ADR 0022):

| The change                                                                   | Merged by                         |
| ---------------------------------------------------------------------------- | --------------------------------- |
| Fix, refactor, test, CI or tooling, docs                                     | the agent, by enabling auto-merge |
| A feature for a `specs/tasks.md` item the maintainer has discussed           | the agent, by enabling auto-merge |
| A spec or ADR change recording a decision the maintainer already made        | the agent, by enabling auto-merge |
| A decision not yet made: new requirement, ADR choosing options, constitution | the maintainer                    |
| Anything weakening privacy or security, or loosening a check                 | the maintainer                    |
| A change to this rule                                                        | the maintainer                    |

An agent that merges says so, with the PR link. When unsure which row a change
falls in, it is the maintainer's. Agents merge one PR before starting work that
depends on it, rather than stacking.

**A red `main` comes first.** When `check` fails on `main`, fix it, or revert
the pull request that broke it, before merging anything else (ADR 0028).

A pull request gets a preview deployment only with the `preview` label; add it
when someone wants to try the change, not by default (ADR 0028).

## First run

```sh
npm ci
npm run dev              # migrates and seeds a local database, prints a sign-in
                         # link for the dev admin, then starts both servers
```

No `.env` and no database server are needed: without `DATABASE_URL` the app
runs on **PGlite** (Postgres in process) in `.data/pglite`, and generates its
session secret once into `.data/session-secret` (ADR 0024). Copy `.env.example`
to `.env` only to change something; set `DATABASE_URL` to use a real Postgres
(`npm run db:up` starts one in Docker).

PGlite admits one process per folder, so while the dev server runs,
`npm run dev:login` is refused: take the link from the outbound message log as
the admin, or stop the server first. Configuration is still validated on start
and names what is wrong rather than failing on first use (R-CFG-1).

## Commands

|                             |                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| `npm run dev`               | migrates and seeds the database, then the server on :3000 and Vite on :5173                      |
| `npm run db:up` / `db:down` | an optional Postgres 17 in Docker, for `DATABASE_URL`                                            |
| `npm run db:reset`          | delete the local PGlite database and rebuild it from the migrations (server stopped)             |
| `npm test`                  | unit tests (Vitest)                                                                              |
| `npm run test:integration`  | API tests — on the Postgres `DATABASE_URL` names, or in-memory PGlite when it is empty or unset  |
| `npm run review`            | the reviewer agent on the branch's change, as the pre-push hook runs it                          |
| `npm run lint`              | ESLint + Prettier check                                                                          |
| `npm run typecheck`         | `tsc --noEmit` and `vue-tsc` for the client                                                      |
| `npm run migrate`           | migrations, forward-only                                                                         |
| `npm run seed`              | seeds per `SEED_PROFILE` (`dev` \| `prod`)                                                       |
| `npm run dev:login [email]` | prints a sign-in link for a seeded member (default: the dev admin) — development, server stopped |

## The six that get a change rejected

1. **A behavior change without tests.** (§2)
2. **A role name in a conditional** instead of a permission check. (§5, ADR 0006)
3. **PII in a log, an error, or an analytics event** — email, name, challenge
   text. (§5)
4. **A contact detail readable** without an accepted connection and a party
   check. (§5, ADR 0004)
5. **A comment explaining what the code does**, a commented-out block, or change
   history in source. (§3)
6. **A magic number** where a config value belongs. (§7)

## Conventions worth knowing before you start

- **TypeScript, strict.** Types carry the contract; schemas validate the
  boundary. Both, not either (ADR 0011).
- **Thin routes, decisions in services, dependencies passed in.** It is what
  makes the critical modules testable without a database (§4).
- **Every message is recorded** in the outbound log, in every environment; in
  development nothing is sent, so `/admin/outbox` is where magic links live
  (ADR 0016).
- **Every screen has a URL.** No modals for anything linkable (ADR 0007).
- **Not found, never forbidden**, for anything the caller may not see (§5).
- Spec prose wraps at 80 columns. Match the file you are editing.

## Working with a stale assumption

The spec is the source of truth and it moves. If the code and `specs/` disagree,
the spec wins and the code is the bug — unless the spec is wrong, in which case
fix the spec first and say so. Never silently widen scope to resolve a
contradiction; ask.
