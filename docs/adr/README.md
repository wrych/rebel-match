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

`Proposed` · `Accepted` · `Accepted, amended by NNNN` · `Superseded by NNNN` ·
`Deprecated`

A decision that is **partly** revised is amended, not superseded: the original
still holds except where the later ADR says otherwise.

## Index

| #                                                          | Decision                                                             | Status                    |
| ---------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------- |
| [0001](0001-record-architecture-decisions.md)              | Record architecture decisions                                        | Accepted                  |
| [0002](0002-node-express-mysql.md)                         | Node.js, Express and MySQL                                           | Accepted, amended by 0024 |
| [0003](0003-passwordless-magic-link-auth.md)               | Passwordless magic-link auth over a whitelist                        | Accepted, amended by 0027 |
| [0004](0004-double-opt-in-contact-exchange.md)             | Double opt-in before any contact detail is shared                    | Accepted                  |
| [0005](0005-mixpanel-eu-residency.md)                      | Mixpanel with EU data residency for analytics                        | Accepted, amended by 0026 |
| [0006](0006-role-based-access-control.md)                  | Role-based access control instead of an is_admin flag                | Accepted, amended by 0021 |
| [0007](0007-addressable-screens-not-modals.md)             | Addressable screens instead of modals                                | Accepted                  |
| [0008](0008-own-smtp-with-dev-outbox.md)                   | Own SMTP server, with a no-send outbox in development                | Accepted, amended by 0016 |
| [0009](0009-per-environment-seed-profiles.md)              | Per-environment seed profiles                                        | Accepted                  |
| [0010](0010-keyword-trend-matching-for-beta.md)            | Keyword-based trend matching for the beta                            | Accepted                  |
| [0011](0011-typescript-strict.md)                          | TypeScript in strict mode                                            | Accepted                  |
| [0012](0012-conventional-commits-one-change-per-pr.md)     | Conventional Commits, one change per pull request                    | Accepted                  |
| [0013](0013-tell-applicants-their-status.md)               | Tell applicants their status, accepting email enumeration            | Accepted                  |
| [0014](0014-qr-invite-tokens.md)                           | Invite tokens in the QR code, auto-approving the scanner             | Accepted                  |
| [0015](0015-own-auth-behind-a-narrow-seam.md)              | Build authentication in-app, behind a narrow seam                    | Accepted, amended by 0018 |
| [0016](0016-outbound-message-log.md)                       | Record every outbound message, in every environment                  | Accepted                  |
| [0017](0017-vue-spa-with-a-shared-route-table.md)          | A Vue SPA, with one route table shared by client and server          | Accepted                  |
| [0018](0018-the-auth-seam-owns-its-session-cookie.md)      | The auth seam owns its sessions and hands routes the cookie          | Accepted, amended by 0020 |
| [0019](0019-gate-pushes-on-tests-and-a-reviewer-agent.md)  | Gate pushes on the test suites and a reviewer agent                  | Accepted                  |
| [0020](0020-slide-the-session-on-use.md)                   | Slide the session on use, and renew its cookie from the seam         | Accepted                  |
| [0021](0021-permission-policy-seam.md)                     | Read permissions through a policy seam                               | Accepted                  |
| [0022](0022-agents-merge-routine-prs.md)                   | Agents merge routine pull requests; people approve decisions         | Accepted, amended by 0028 |
| [0023](0023-prototype-look-and-colour-modes.md)            | Wear the prototype's look, with happy mode as a colour mode          | Accepted                  |
| [0024](0024-postgres-via-drizzle-with-pglite-for-dev.md)   | Postgres through Drizzle, with PGlite for development and tests      | Accepted                  |
| [0025](0025-cloud-run-promote-staging.md)                  | Cloud Run from GitHub; production promoted from staging              | Accepted, amended by 0028 |
| [0026](0026-analytics-opt-in-sent-from-the-server.md)      | Analytics is opt-in, and every event goes from the server            | Accepted                  |
| [0027](0027-sign-in-with-a-button.md)                      | Sign in with a button, never by opening the link                     | Accepted, amended by 0034 |
| [0028](0028-merge-without-updating.md)                     | Merge without updating the branch; previews on request               | Accepted                  |
| [0029](0029-rate-limits-with-a-self-hosted-human-check.md) | Rate-limit sign-in, with a self-hosted human check                   | Accepted, amended by 0030 |
| [0030](0030-human-check-before-more-link-emails.md)        | Ask for the human check before more link emails to one address       | Accepted                  |
| [0031](0031-hosts-change-selected-settings.md)             | Hosts change selected settings in the app, stored in the database    | Accepted                  |
| [0032](0032-erasure-waits-30-days.md)                      | Erasure waits 30 days, during which it can be undone                 | Accepted                  |
| [0033](0033-record-activity-show-it-later.md)              | Record activity in our own tables; showing it is separate            | Accepted                  |
| [0034](0034-hardened-headers-transport-and-sessions.md)    | Hardened headers, transport and sessions                             | Accepted                  |
| [0035](0035-already-connected-members-skip-the-opt-in.md)  | Members already connected skip the opt-in for each further challenge | Accepted                  |
| [0037](0037-notifications-queued-at-a-cadence-per-type.md) | Store every notification; mail it at a cadence chosen per type       | Proposed                  |
