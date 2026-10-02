# 0001. Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** Andy Moesch

## Context

The beta's shape was settled in one scoping meeting and a long spec review. A
dozen decisions came out of those — the analytics vendor, the access model, the
privacy rule on contact exchange — and they lived only in a transcript, a commit
message, and the specs themselves. Commit messages scroll away; specs state what
the system does, not why it was chosen over the alternative. The decisions were
being re-explained instead of read.

## Decision

Every major decision is recorded as a numbered ADR in `docs/adr/`, written
before the decision lands. `docs/constitution.md` §8 defines "major"; this
directory's README defines the process.

## Alternatives considered

- **A decisions section in the spec** — mixes "what the system does" with "why
  we chose it", and the spec is already long. Different audience, different
  lifetime.
- **Commit messages and PR descriptions only** — unsearchable in practice, and
  invisible to anyone reading the repo six months later.
- **Nothing** — the status quo that caused this ADR.

## Consequences

- A small, standing cost per major decision: one page, written up front.
- Reversals stay legible: a new ADR supersedes an old one, and the old one keeps
  its reasoning instead of being edited into silence.
- Agents working in this repo have a durable record of intent, which is cheaper
  than re-deriving it from the code.
- The twelve decisions already made were backfilled (0002–0012). Backfilled ADRs
  carry the date of the decision, not of the writing.

## References

Constitution §8. Process: `docs/adr/README.md`.
