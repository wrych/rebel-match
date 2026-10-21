# 0056. Let Claude read non-prod, with a key held in its cloud environment

- **Status:** Proposed
- **Date:** 2026-10-21
- **Deciders:** Andy Moesch

## Context

Most of the code is written by Claude Code, much of it in cloud sessions. When
a preview, staging or the tick misbehaves, the cause is in Google Cloud: the
request log, a job's execution log, the state of a revision, the database
instance or the scheduler job (`docs/cloud-setup.md`, "Where to look"). Today
a person reads those and pastes what they find into the session. R-NFR-9 makes
the app record enough to find a cause; nobody who is fixing it can read it.

A cloud session starts each time from a fresh container. `gcloud` is
installed, but signed in as nobody, and nothing typed in one session carries
over to the next. Whatever signs it in has to come from the session's cloud
environment, the one place that applies to every session started in it. An
environment holds two kinds of setting:

- **Network secrets** stay outside the container; a proxy adds them as a
  header to requests for the hosts they name. `gcloud` cannot use one: it
  signs a token with a service account's private key inside the container,
  and trades it for an access token, which lasts an hour.
- **Environment variables** reach every command in the session, and anyone
  who uses the environment can read them. A personal environment is used by
  its owner alone.

There is no setting above environments: a session in another environment gets
none of it.

ADR 0025 chose Workload Identity Federation so that "no service-account key
exists anywhere". That works because GitHub hands each job a signed token
that says who it is. A cloud session has no such token to trade.

## Decision

**A read-only identity in non-prod.** A service account `claude-debug` in
`rebel-match-nonprod` holds `logging.viewer`, `monitoring.viewer`,
`run.viewer`, `cloudsql.viewer` and `cloudscheduler.viewer`, and nothing else:
it reads logs, metrics and the state of services, jobs, the instance and the
tick. It cannot read a secret's value, deploy, change, connect to the database
or delete.

**Its key in the maintainer's cloud environment.** One JSON key, base64 on one
line, in the variable `GCP_DEBUG_KEY_BASE64` of the personal environment the
maintainer runs this repository's sessions in. Every session started there is
signed in; no other is.

**Signed in at session start.** The SessionStart hook, in cloud sessions only,
writes the key where Google's libraries look for default credentials and
activates it for `gcloud`. Without the variable it does nothing.

**Two MCP servers in the repository.** `.mcp.json` runs Google's
`gcloud-mcp` and `observability-mcp`, pinned. In a cloud session they act as
`claude-debug`; on a laptop, as whoever is signed in to `gcloud` there.

**Production is out.** Nothing here reaches `rebel-match-prod`. Its logs are
about real people; whether an agent reads them is decided when the pilot runs
there, by a new ADR.

## Alternatives considered

- **A network secret** — keeps the key out of the container, but `gcloud`
  needs the private key itself. An access token as a network secret would
  stop working within the hour.
- **Workload Identity Federation, as for GitHub** — needs a token from the
  session saying which session it is; cloud sessions offer none.
- **The maintainer's own credentials** — owner of both projects, so any slip
  could delete or deploy, and production would be in reach.
- **Keep pasting logs into the session** — no key, but a person in the loop
  for every look, and the paste is whatever they thought relevant.

## Consequences

- A service-account key now exists, against ADR 0025's rule, which this
  amends for this one identity. A leaked key reads non-prod's logs and state
  until it is deleted; non-prod holds only fictional people (ADR 0025), but
  its logs also hold the testers' IP addresses, and a sign-in job's log holds
  a working link for the dev admin on staging or a preview (R-DEV-6).
  Deleting the key (`cloud-setup.md`, "Read-only access for Claude") stops it
  at once.
- The key does not expire. Rotating it is a person's job; nothing reminds us.
- Every session in that environment can read the key, including scheduled
  ones. Using the environment for other repositories gives their sessions the
  same access.
- On a laptop, the MCP servers act with the developer's own rights. Claude
  Code asks before each tool call unless told otherwise; that is the guard.
- An organization policy may forbid service-account keys
  (`iam.disableServiceAccountKeyCreation`); the setup says how to tell.

## References

Requirements: `R-NFR-5`, `R-NFR-9`, `R-DEV-6`. ADRs: 0025, 0049.
`docs/cloud-setup.md`, "Read-only access for Claude".
