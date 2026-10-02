# 0011. TypeScript in strict mode

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** Andy Moesch

## Context

No code exists yet, so the language is still a free choice. Two of this
project's rules lean on it. The constitution forbids comments that explain what
code does and caps doc comments at 300 characters — which only works if the
signatures carry the contract. And the privacy-critical paths (contact exchange,
permission checks, token handling) are exactly where an undefined slipping
through a boundary turns into a disclosure.

## Decision

TypeScript everywhere — server and client — with `strict: true`, no implicit
`any`, and `tsc --noEmit` in CI. Runtime input is still validated with a schema
at every boundary: types describe our code's contracts, schemas guard what
arrives from outside.

## Alternatives considered

- **JavaScript with JSDoc types** — no build step, checkable by `tsc`, but the
  annotations are comments, and they compete with the rule that keeps comments
  scarce.
- **Plain JavaScript** — fastest start, and the safety of the contact-exchange
  rules would rest entirely on tests. Not worth it for a privacy-critical app.

## Consequences

- A build step, and `npm run build` becomes part of CI (R-QA-3).
- Types are not validation: a `Member` type proves nothing about a request body,
  so boundary schemas stay mandatory (R-CFG-3, constitution §5).
- Shared types across server and client keep the config contract honest — the
  same limits object feeds the submit button and the server check (R-CFG-2).
- Slightly slower to write, materially cheaper to refactor — and there will be
  refactoring before 2026-11-01.

## References

Constitution §3, §5. Requirements: R-QA-1..3, R-CFG-2.
