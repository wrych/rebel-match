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

## First run

```sh
npm ci
cp .env.example .env     # then set SESSION_SECRET to 32+ characters
npm run dev              # starts MySQL if Docker is reachable, migrates, then both servers
```

`npm run dev` fails loudly if configuration is missing, by design — it validates
the environment and names what is absent rather than failing later on first use
(R-CFG-1). Without a Docker daemon it starts anyway and `/api/health` reports
`"database": "down"`; everything not backed by the database still works.

## Commands

|                             |                                                                                                    |
| --------------------------- | -------------------------------------------------------------------------------------------------- |
| `npm run dev`               | starts the database (if Docker is reachable), migrates, then the server on :3000 and Vite on :5173 |
| `npm run db:up` / `db:down` | the development MySQL on its own                                                                   |
| `npm run db:reset`          | drop the volume and rebuild from the migrations                                                    |
| `npm test`                  | unit tests (Vitest)                                                                                |
| `npm run test:integration`  | API tests — needs a database (`npm run db:up`)                                                     |
| `npm run lint`              | ESLint + Prettier check                                                                            |
| `npm run typecheck`         | `tsc --noEmit` and `vue-tsc` for the client                                                        |
| `npm run migrate`           | migrations, forward-only                                                                           |
| `npm run seed`              | seeds per `SEED_PROFILE` (`dev` \| `prod`)                                                         |

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
