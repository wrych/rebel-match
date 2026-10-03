# 0025. Host on Google Cloud Run, deploy from GitHub, promote staging to production

- **Status:** Proposed
- **Date:** 2026-10-03
- **Deciders:** Andy Moesch

## Context

Nothing is deployed yet. The summit is on 2026-11-08, and the pilot group (M6)
and the mail-reputation trickle (`docs/email-setup.md`) both need a live server
weeks before that. ADR 0024 moved to Postgres 17 partly because Google Cloud or
Azure would host the app; the choice between them is now made for Google Cloud,
as a platform the maintainer wants to learn.

Three deployments are wanted: **production**; **staging**, which production is
only ever a promotion of; and **dev**, for trying a branch before it merges.
All of them deploy from GitHub, with no hand-run commands.

The app constrains the shape:

- One Node process serving the API and the SPA; ~350 members, no horizontal
  scaling required (R-NFR-4). Sessions live in the database.
- Secrets come from the environment, never source (R-NFR-5); the real whitelist
  is a private file supplied at deploy time (R-SEED-5).
- Production refuses to start with mail off (R-DEV-5) and refuses dev fixtures
  (R-SEED-4). Only `NODE_ENV=development` with `MAIL_DELIVERY=none` is a
  development deployment, which keeps magic links readable (R-DEV-1).
- Mail goes through the team's own SMTP server (ADR 0008). Google Cloud blocks
  outbound port 25, so the MTA cannot move there; the app submits on 587.
- The outbound log is purged by an in-process timer (R-MSG-6), which needs CPU
  between requests.
- The magic link must arrive and onboarding complete inside two minutes on
  conference wifi (R-NFR-3); a cold start is part of that budget.
- Personal data stays in Europe (ADR 0005 set the same rule for analytics).

## Decision

**Platform.** Google Cloud, region `europe-west6` (Zurich). The app runs on
**Cloud Run** as one container image; the database is **Cloud SQL for
Postgres 17**, reached through the Cloud SQL connector without a public IP.
Images live in **Artifact Registry**, secrets in **Secret Manager**, mounted as
environment variables, and the seed files as secret volumes.

**Projects.** Two: `rebel-match-nonprod` holds dev and staging on one small
Cloud SQL instance, a database each; `rebel-match-prod` holds production on its
own instance with automated backups and point-in-time recovery. Production's
data, permissions and bill are isolated from everything an experiment touches.

**From GitHub.** GitHub Actions authenticates through **Workload Identity
Federation**: no service-account key exists anywhere. Each GitHub Environment
(`dev`, `staging`, `production`) maps to its own deploy identity, and the
production identity trusts only `environment:production` of this repository.
The existing `check` job stays the gate; nothing deploys from a red commit.

**Build once.** An image is built per commit and tagged with its git SHA.
Production never builds: it runs the exact digest staging ran.

| Deployment     | Trigger                                     | Configuration                                                                                                    |
| -------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **dev**        | push to a pull request                      | as staging, each pull request on its own database                                                                |
| **staging**    | merge to `main`                             | `NODE_ENV=production`, `MAIL_DELIVERY=smtp`, `SEED_PROFILE=prod` with a **team-only** whitelist and test content |
| **production** | manual "promote" workflow, needs a reviewer | `NODE_ENV=production`, `MAIL_DELIVERY=smtp`, `SEED_PROFILE=prod` with the real files                             |

- **Dev previews** deploy to one `rebel-match-dev` service as a revision with
  no traffic and a tag `pr-<n>`, which gives each pull request its own URL. Each
  gets its own database, created on first deploy and dropped, with the tag, when
  the pull request closes. A preview is a deployed server, so it is **not** a
  development deployment (requirements §8c): it redacts like staging, and a
  tester signs in through their own team mailbox.
- **Staging is production's configuration with different data.** It runs the
  same code path, sends real mail, and redacts the log (R-MSG-4) — but its
  whitelist holds only the team's addresses and its challenges are invented. No
  attendee's address is ever in non-prod. Its mail, and the previews', is part
  of the reputation trickle the email runbook asks for. The prototype's
  fictional roster stays a local `npm run dev` affordance (R-DEV-1, R-DEV-6).
- **Promotion** is a `workflow_dispatch` workflow on the `production`
  environment, with the maintainer as required reviewer. It reads the digest
  staging is serving and deploys that. Rolling back is promoting an earlier
  digest, or shifting traffic to the previous revision.

**Each deploy** runs, in order: the migrations as a **Cloud Run job** from the
same image, then the seed (idempotent, R-SEED-7), then the new revision takes
traffic. A failing step stops the deploy with the old revision still serving.

**Sizing.** Production keeps **one instance warm** with CPU always allocated,
and at most two, so no attendee waits on a cold start and the purge timer runs.
Dev and staging scale to zero; their purge runs on every start, which is late
but bounded, and they hold no attendee data.

**Addresses.** Dev and staging use their `run.app` URLs. Production's own domain
sits behind a global external Application Load Balancer, which works in every
region and leaves room for Cloud Armor rate limits later. `PUBLIC_URL` is set
per deployment to the address members' links point at.

## Alternatives considered

- **Azure (Container Apps, PostgreSQL Flexible Server)** — equally capable, and
  the closer skill for Microsoft-heavy clients; more resources to stand up before
  the first deploy, and per-branch URLs take more work.
- **One project for everything** — simplest, but one wrong IAM grant reaches
  production data. **Three projects** — cleanest, but triples setup for a dev
  environment that holds only fictional data.
- **Rebuild for production from the release tag** — a second build is a second
  chance for the artifact to differ from what was tested.
- **Previews on PGlite inside the container** — no database to create or drop,
  but data vanishes on every restart and previews would not run the engine
  production runs.
- **Previews or staging as development deployments** (mail off, links readable,
  the fictional roster) — §8c says every deployed server redacts, so this needs
  a privacy requirement loosened for a public URL; and it would never exercise
  real mail, redaction or the prod seed, the parts that fail at a summit.
- **Cloud Run domain mapping instead of a load balancer** — cheaper, but not
  offered in every region, and still in preview.
- **Scale production to zero** — saves a few francs a month and costs the
  first scanner of a quiet break a cold start, and the purge its schedule.

## Consequences

- Every merge reaches staging in minutes; production changes only when someone
  presses approve, and what ships is byte-for-byte what was tested.
- **Migrations run before the old revision stops.** Each must work with the
  previous release still serving. Constitution §6 already asks for additive
  changes (add, backfill, switch, remove); a deploy now depends on it.
- The image must run migrations and the seed without dev dependencies — both are
  `tsx` scripts today — and the server must serve the built client.
- More than one instance can run. State that must hold across requests — link
  rate limits (R-NFR-5) when they land — belongs in the database, not in memory.
- The SMTP server sees Cloud Run's changing egress addresses. If it relays by IP
  rather than by authentication, production needs Cloud NAT with a static IP.
- Dev previews and staging are publicly reachable, as production is. They hold
  only the team's addresses and invented content, and sign-in still needs a
  whitelisted mailbox; Identity-Aware Proxy is the step up if that changes.
- Previews have no fictional members, so a swipe deck there is only as full as
  the staging challenges file makes it.
- A non-prod whitelist file and challenges file must exist before the first
  preview or staging deploy, kept, like production's, out of the repository.
- Cost is tens of francs a month, most of it the warm production instance,
  the load balancer, and two Cloud SQL instances. Billing alerts go on both
  projects on day one.
- The setup itself (projects, identities, secrets) is a manual, one-time step,
  written up as a runbook beside `docs/email-setup.md`. Infrastructure as code
  is a later decision, not this one.

## References

Requirements: R-NFR-3, R-NFR-4, R-NFR-5, R-DEV-1, R-DEV-4, R-DEV-5, R-DEV-6,
R-MSG-4, R-MSG-6, R-SEED-4, R-SEED-5, R-SEED-7, R-QA-6. ADRs 0005, 0008, 0009,
0016, 0019, 0024. Spec: `specs/design.md` §6.4; `docs/email-setup.md`.
