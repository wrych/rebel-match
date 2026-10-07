# 0025. Host on Google Cloud Run, deploy from GitHub, promote staging to production

- **Status:** Accepted, amended by 0028 and 0044
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
All of them deploy from GitHub, with no hand-run commands. Staging and dev must
not send mail.

The app constrains the shape:

- One Node process serving the API and the SPA; ~350 members, no horizontal
  scaling required (R-NFR-4). Sessions live in the database.
- Secrets come from the environment, never source (R-NFR-5); the real whitelist
  is a private file supplied at deploy time (R-SEED-5).
- Production refuses to start with mail off (R-DEV-5) and refuses dev fixtures
  (R-SEED-4). A development deployment (`NODE_ENV=development`,
  `MAIL_DELIVERY=none`) keeps magic links readable (R-DEV-1), so it may hold
  only fictional people (requirements §8c, R-SEED-8).
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
Postgres 17**, reached only through Cloud Run's built-in Cloud SQL connection:
the instance authorizes no networks, so nothing connects to it directly.
Images live in **Artifact Registry**, secrets in **Secret Manager**, mounted as
environment variables, and production's seed files as secret volumes.

**Projects.** Two: `rebel-match-nonprod` holds dev and staging on one small
Cloud SQL instance, a database each; `rebel-match-prod` holds production on its
own instance with automated backups and point-in-time recovery. Production's
data, permissions and bill are isolated from everything an experiment touches.

**From GitHub.** GitHub Actions authenticates through **Workload Identity
Federation**: no service-account key exists anywhere. Non-prod and production
each have their own deploy identity, and the production identity trusts only
`environment:production` of this repository. The existing `check` job stays
the gate; nothing deploys from a red commit.

**Build once.** An image is built per commit and tagged with its git SHA.
Production never builds: it runs the exact digest staging ran.

| Deployment     | Trigger                                     | Configuration                                                                            |
| -------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **dev**        | push to a pull request                      | development deployment: `NODE_ENV=development`, `MAIL_DELIVERY=none`, `SEED_PROFILE=dev` |
| **staging**    | merge to `main`                             | the same as dev, on its own long-lived database                                          |
| **production** | manual "promote" workflow, needs a reviewer | `NODE_ENV=production`, `MAIL_DELIVERY=smtp`, `SEED_PROFILE=prod` with the real files     |

- **Staging and dev hold only fictional people and send nothing.** They are
  development deployments (requirements §8c): the prototype's roster, mail
  recorded as `suppressed`, links readable in the outbox. Nobody needs a
  mailbox to test, and no message can reach a real person. They hold no SMTP
  credentials at all.
- **Dev previews** deploy to one `rebel-match-dev` service as a revision with
  no traffic and a tag `pr-<n>`, which gives each pull request its own URL. Each
  gets its own database, created on first deploy and dropped, with the tag, when
  the pull request closes.
- **The first sign-in** on a deployed development deployment is `dev:login`
  (R-DEV-6) run as a one-off Cloud Run job against that database; the link
  lands in the job's log, which only project members can read.
- **Promotion** is a `workflow_dispatch` workflow on the `production`
  environment, with the maintainer as required reviewer. It reads the digest
  staging is serving and deploys that with production's configuration. Rolling
  back is promoting an earlier digest, or shifting traffic to the previous
  revision.

**Each deploy** runs, in order: the migrations as a **Cloud Run job** from the
same image, then the seed (idempotent, R-SEED-7), then the new revision takes
traffic. A failing step stops the deploy with the old revision still serving.

**Sizing.** Production keeps **one instance warm** with CPU always allocated,
and at most two, so no attendee waits on a cold start and the purge timer runs.
Dev and staging scale to zero; their purge runs on every start.

**Addresses.** Dev and staging use their `run.app` URLs. Production's own domain
sits behind a global external Application Load Balancer, which works in every
region and leaves room for Cloud Armor rate limits later. `PUBLIC_URL` is set
per deployment to the address members' links point at.

**Rollout, in two steps.** Non-prod costs a few francs a month; production's
warm instance, load balancer and second database cost most of the rest. So:

1. **Non-prod first.** The non-prod project is set up by hand
   (`docs/cloud-setup.md`, part 1), then one pull request adds the deploy
   workflows for previews and staging, with what the image needs to run there.
   From then on every pull request gets a preview and every merge reaches
   staging.
2. **Production when the pilot needs it.** The production project (part 2),
   then a second pull request adds the promote workflow. It has to land in time
   for the pilot (M6) and for the mail trickle, which wants weeks rather than
   days (`docs/email-setup.md`). Until then, staging is the only shared
   deployment, and nothing can reach production because it does not exist.

Nothing in step 1 is redone in step 2: production adds a project and two grants
on non-prod (pulling images, reading which digest staging serves).

## Alternatives considered

- **Azure (Container Apps, PostgreSQL Flexible Server)** — equally capable, and
  the closer skill for Microsoft-heavy clients; more resources to stand up before
  the first deploy, and per-branch URLs take more work.
- **Staging as production's configuration** (real mail, redaction, the prod seed
  with a team-only whitelist) — exercises more of production before it ships,
  but every tester needs a real mailbox, and staging could mail a real person.
- **One project for everything** — simplest, but one wrong IAM grant reaches
  production data. **Three projects** — cleanest, but triples setup for
  environments that hold only fictional data.
- **Rebuild for production from the release tag** — a second build is a second
  chance for the artifact to differ from what was tested.
- **Previews on PGlite inside the container** — no database to create or drop,
  but data vanishes on every restart and previews would not run the engine
  production runs.
- **Cloud Run domain mapping instead of a load balancer** — cheaper, but not
  offered in every region, and still in preview.
- **Scale production to zero** — saves a few francs a month and costs the
  first scanner of a quiet break a cold start, and the purge its schedule.

## Consequences

- Every merge reaches staging in minutes; production changes only when someone
  presses approve, and what ships is byte-for-byte what was tested.
- **Real mail, redaction and the prod seed run first in production.** Staging
  cannot catch a broken SMTP setting. Production therefore goes up early, for
  the pilot and the reputation trickle, and a promotion is followed by one real
  sign-in from a team mailbox.
- **The prod seed must refuse a development deployment (R-SEED-8)** before the
  first deploy; that guard is what makes readable links on a public URL safe.
- Staging and previews are publicly reachable and anyone can sign in as a
  fictional member through the outbox. That is the point, and acceptable while
  they hold nothing real. Someone typing a real address there leaves it in the
  log until retention purges it; their URLs are not published.
  Identity-Aware Proxy is the step up if that changes.
- **Migrations run before the old revision stops.** Each must work with the
  previous release still serving. Constitution §6 already asks for additive
  changes (add, backfill, switch, remove); a deploy now depends on it.
- The image must run migrations, the seed and `dev:login` without dev
  dependencies — all three are `tsx` scripts today — and the server must serve
  the built client.
- More than one instance can run. State that must hold across requests — link
  rate limits (R-NFR-5) when they land — belongs in the database, not in memory.
- The SMTP server sees Cloud Run's changing egress addresses. If it relays by IP
  rather than by authentication, production needs Cloud NAT with a static IP.
- Cost is a few francs a month while only non-prod exists, mostly its
  database, which can be stopped when unused. With production it is tens of
  francs, most of it the warm instance, the load balancer, and the second
  Cloud SQL instance. Each project gets a billing alert the day it is created.
- Production comes later, so it is the one deployment whose setup is not
  exercised every day. Part 2 of the runbook has to be followed carefully once,
  and the first promotion is a rehearsal well before the summit, not on the
  day.
- The one-time setup (projects, identities, database, secrets) is manual,
  written up step by step in `docs/cloud-setup.md`, in the same two parts. Infrastructure as code is a
  later decision, not this one.

## References

Requirements: R-NFR-3, R-NFR-4, R-NFR-5, R-DEV-1, R-DEV-4, R-DEV-5, R-DEV-6,
R-MSG-4, R-MSG-6, R-SEED-4, R-SEED-5, R-SEED-7, R-SEED-8; requirements §8c.
ADRs 0005, 0008, 0009, 0016, 0019, 0024. Spec: `specs/design.md` §6.4;
`docs/email-setup.md`, `docs/cloud-setup.md`.
