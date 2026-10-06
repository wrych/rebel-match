# 0039. Count an invite open on the visitor's first interaction

- **Status:** Accepted
- **Date:** 2026-10-06
- **Deciders:** Andy Moesch

## Context

ADR 0038 counts an open each time the entry screen loads with an invite token.
Invite links are also sent by message and email, and link-protection services
open them: Safe Links, Proofpoint, Mimecast and similar run the page in a
headless browser, which loads it and runs its script like a visitor would. Each
scan counts as an open, often more than once, and a reload counts again. Hosts
read the count to decide whether to raise a cap, so a count inflated by
machines misleads them. A count that is low by the visitors who leave without
touching anything misleads less.

## Decision

- **An open is the visitor's first interaction with the entry screen**, not its
  load. The screen counts the first pointer press, touch or key press while the
  tab is visible, once, then stops listening.
- **A browser that says it is automated is not counted**
  (`navigator.webdriver`).
- **A tab counts an invite once:** a reload or a return to the screen in the
  same tab does not count again.
- Everything else in ADR 0038 holds: the same endpoint, table and display, and
  nothing about the visitor.

## Alternatives considered

- **Keep counting loads** — counts every scanner run, so the number cannot be
  trusted.
- **Filter scanners on the server by User-Agent or address** — scanners pose as
  ordinary browsers on cloud addresses, and it means reading data about the
  visitor we otherwise never look at.
- **Count only a submitted email address** — nearly the same number as uses,
  which the card already shows.

## Consequences

- A visitor who reads the screen and leaves without touching it is not counted,
  so opens are a lower bound on interested people rather than an upper bound on
  page loads.
- A scanner that simulates a click or key press is still counted. None of the
  common ones do, as far as we know.
- A count of loads can be added later as a separate number, beside this one.

## References

Amends ADR 0038 (what an open is). Requirements: R-STAT-6.
