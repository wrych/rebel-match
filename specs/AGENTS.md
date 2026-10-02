# AGENTS.md — editing the spec

Rules for this directory. The root [`AGENTS.md`](../AGENTS.md) and
[constitution](../docs/constitution.md) still apply; this adds what is specific
to spec prose.

The spec is the contract the code is judged against. Treat it as production.

## Requirement ids

- Format `R-<AREA>-<n>`: `R-AUTH`, `R-ONB`, `R-ASK`, `R-OFF`, `R-CONN`,
  `R-MINE`, `R-FB`, `R-ANA`, `R-NAV`, `R-DEV`, `R-CFG`, `R-QA`, `R-SEED`,
  `R-ROLE`, `R-NFR`.
- **Append; do not renumber.** An id is cited from `design.md`, `flows.md`,
  `tasks.md`, ADRs, commit messages, and PRs. Renumbering invalidates all of it.
- A new area gets a new prefix rather than squeezing into an existing one.
- Retiring a requirement: mark it withdrawn in place, keeping the number. Never
  reuse a number, never close a gap.
- If a renumber is genuinely unavoidable, update every cross-reference in the
  same commit and say so in the message. Verify with the check below.

## Acceptance criteria

Use EARS phrasing, as the top of `requirements.md` states:

- `WHEN <trigger> THE SYSTEM SHALL <response>`
- `WHILE <state> …` / `IF <condition> THEN THE SYSTEM SHALL …`
- Unconditional: `The system SHALL …`

`SHALL` is a requirement, `SHOULD` is a preference, `MAY` is permission. Do not
use "must", "will", or "needs to" — they read as requirements without being
ones.

One testable statement per requirement. If it contains an "and" that could fail
independently, it is two requirements.

## House style

- Wrap prose at **about 80 columns**, matching the file you are editing; tables
  and code may exceed it. Prettier runs with `proseWrap: preserve`, so it never
  reflows a paragraph for you: **do not reflow paragraphs you did not otherwise
  change**, or a one-line edit arrives as a hundred-line diff.
- Sections separated by `---`, blank line before every heading and list.
- Preserve the meeting quotes — they record intent that outlives us, and they
  are why several rules exist. Format: `*(Meeting: "…")*`.
- Rationale belongs in the requirement when short, in an ADR when it is a
  decision.
- Cross-reference by id and section (`R-CONN-6`, `design.md` §4, `flows.md` F7),
  never by page or line number.

## Keeping the four documents consistent

A change rarely touches one file. Before committing, check the set:

| Changed       | Also update                                                                  |
| ------------- | ---------------------------------------------------------------------------- |
| a requirement | `design.md` (how), `flows.md` (where it is felt), `tasks.md` (who builds it) |
| a screen      | `design.md` §4 table **and** the `S*` references in `flows.md`               |
| a URL         | `design.md` §4, requirements R-NAV-4 table, `flows.md` F13                   |
| a threshold   | the config table in `design.md`, not the prose that quotes it                |
| a decision    | an ADR in `docs/adr/`, plus the index                                        |
| scope         | `priorities.md` (MoSCoW) and `tasks.md` (milestone)                          |

**Open questions** in `requirements.md` §11 are never deleted. A resolved one
moves to the `Resolved` list with its date and the decision — that list is how
we remember what was already settled. Renumbering the open list means fixing the
`tasks.md` references that point at it.

## Verify before committing

Every cited id exists (prints nothing when clean):

```sh
grep -rno "R-[A-Z]\+-[0-9]\+" specs/*.md | awk -F: '{print $3}' | sort -u > /tmp/refs
grep -o "^- \*\*R-[A-Z]\+-[0-9]\+" specs/requirements.md | sed 's/^- \*\*//' | sort -u > /tmp/defs
comm -23 /tmp/refs /tmp/defs
```

Over-long prose lines:

```sh
awk 'length($0)>80 && !/^\|/ {print FILENAME" L"NR}' specs/*.md
```

## What does not belong here

- Implementation detail that is not a constraint — that is `design.md` at most.
- Vendor comparisons and the reasoning behind a choice — that is an ADR.
- Task tracking — that is `tasks.md`.
- Anything about _how we write code_; that is the constitution.
