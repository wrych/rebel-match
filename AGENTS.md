# AGENTS.md

How to work in this repository. Read this first; it is short on purpose.

- **What this is** — Rebel Match: a peer-matching app for the Corporate Rebels
  network. Members post an organizational challenge and are matched with peers
  in the same boat, peers who have solved it, and curated case studies. Launches
  at a summit on **2026-11-08**, feature-complete **2026-11-01**.
- **The rules** — [`docs/constitution.md`](docs/constitution.md). Not optional,
  and citable in review.
- **What it must do** — [`specs/README.md`](specs/README.md) is the index.
- **Why it is like this** — [`docs/adr/`](docs/adr/README.md).

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
src/                server + client (not yet created; M0 in tasks.md)
```

## How a change happens

1. **Find the requirement.** Every change serves an `R-*` id. If none covers it,
   the spec changes first — in its own commit.
2. **Check for a decision.** Major and not yet decided? Write the ADR before the
   code (constitution §8). Already decided? Follow it, or supersede it properly.
3. **Branch**, one change per branch.
4. **Write the test with the change**, same commit (§2).
5. **Open a PR** citing the requirement, and the ADR if there is one.
   Squash-merge.

Do not batch unrelated fixes. Do not land a refactor and a behavior change
together. If a change grows past what a reviewer can hold in their head, split
it.

## Commands

Not wired yet — `src/` does not exist. M0 in `specs/tasks.md` creates them, and
they land here in the same change:

| | |
|---|---|
| `npm test` | unit tests (Vitest) |
| `npm run test:integration` | API tests against a disposable MySQL |
| `npm run lint` | ESLint + Prettier check |
| `npm run typecheck` | `tsc --noEmit`, strict |
| `npm run migrate` | migrations, forward-only |
| `npm run seed` | seeds per `SEED_PROFILE` (`dev` \| `prod`) |
| `npm run dev` | local server; mail goes to the outbox, never out |

## The six that get a change rejected

1. **A behavior change without tests.** (§2)
2. **A role name in a conditional** instead of a permission check. (§5, ADR
   0006)
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
- **Dev sends no email.** Magic links appear on `/admin/outbox` (ADR 0008).
- **Every screen has a URL.** No modals for anything linkable (ADR 0007).
- **Not found, never forbidden**, for anything the caller may not see (§5).
- Spec prose wraps at 80 columns. Match the file you are editing.

## Working with a stale assumption

The spec is the source of truth and it moves. If the code and `specs/` disagree,
the spec wins and the code is the bug — unless the spec is wrong, in which case
fix the spec first and say so. Never silently widen scope to resolve a
contradiction; ask.
