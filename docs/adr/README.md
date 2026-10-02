# Architecture Decision Records

One decision per file, numbered in order, never renumbered. An ADR is a page:
what the situation was, what we chose, and what we now live with.

## When an ADR is required

Before the decision lands — not after. Required when the decision is:

- **hard to reverse** — a datastore, a vendor, an auth or access-control model,
  a URL scheme, a language or framework, a public contract;
- **surprising later** — a future maintainer would ask "why is it like this?";
- **a rule everyone must follow** — anything added to `docs/constitution.md`.

Not required for: a bug fix, a refactor that preserves behavior, a dependency
bump, or anything the requirements already settle (cite the `R-*` id instead).

## How to add one

1. Copy `template.md` to `NNNN-short-kebab-title.md`, next number up.
2. Fill it in. Keep it to one page; link the spec sections instead of restating
   them.
3. Open it in the PR that implements the decision, or ahead of it. The PR
   references the ADR number.
4. Superseding, never editing: a reversed decision gets a new ADR, and the old
   one's status becomes `Superseded by NNNN`. History stays readable.

## Status values

`Proposed` · `Accepted` · `Superseded by NNNN` · `Deprecated`

## Index

| # | Decision | Status |
|---|----------|--------|
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | Accepted |
| [0002](0002-node-express-mysql.md) | Node.js, Express and MySQL | Accepted |
| [0003](0003-passwordless-magic-link-auth.md) | Passwordless magic-link auth over a whitelist | Accepted |
| [0004](0004-double-opt-in-contact-exchange.md) | Double opt-in before any contact detail is shared | Accepted |
| [0005](0005-mixpanel-eu-residency.md) | Mixpanel with EU data residency for analytics | Accepted |
| [0006](0006-role-based-access-control.md) | Role-based access control instead of an is_admin flag | Accepted |
| [0007](0007-addressable-screens-not-modals.md) | Addressable screens instead of modals | Accepted |
| [0008](0008-own-smtp-with-dev-outbox.md) | Own SMTP server, with a no-send outbox in development | Accepted |
| [0009](0009-per-environment-seed-profiles.md) | Per-environment seed profiles | Accepted |
| [0010](0010-keyword-trend-matching-for-beta.md) | Keyword-based trend matching for the beta | Accepted |
| [0011](0011-typescript-strict.md) | TypeScript in strict mode | Accepted |
| [0012](0012-conventional-commits-one-change-per-pr.md) | Conventional Commits, one change per pull request | Accepted |
