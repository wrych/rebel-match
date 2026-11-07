# 0064. Production promotes only images built from main

- **Status:** Proposed
- **Date:** 2026-11-07
- **Deciders:** Andy Moesch

## Context

ADR 0025 builds an image once per commit and promotes to production the digest
staging serves, or an earlier digest given to roll back (ADR 0044). The
production identity trusts only the `production` environment, which waits for
a reviewer.

Everything before that gate shared one identity. `github-deployer` in non-prod
answered to both the `dev` and `staging` GitHub environments, held
`roles/run.admin` on the whole project and wrote to the one image repository.
`dev` has no protection, and a preview runs the pull request's own workflow
and scripts. So anyone who can push a branch could become that identity,
redeploy `rebel-match-staging` with an image of their own, or push one to the
repository, and the next promotion would carry it to production with
production's secrets and real members' data. The reviewer sees only a
`sha256:` digest, which says nothing about where the image came from.

ADR 0025 accepted that anyone who can push can deploy to non-prod. It did not
account for non-prod being where production's image comes from.

## Decision

**Two image repositories in non-prod.** `rebel-match` holds the images built
for pull-request previews. `rebel-match-release` holds those built from `main`,
and only it is read by production.

**Two deploy identities in non-prod.**

- `github-deployer` deploys previews. It answers only to the `dev` environment
  and writes only to `rebel-match`.
- `staging-deployer` deploys staging. It answers only to a job in the `staging`
  environment running on `refs/heads/main`, and it alone writes to
  `rebel-match-release`.

The ref is checked by Google, through a Workload Identity attribute that joins
the token's environment and ref. GitHub's own branch rule on the `staging`
environment checks it as well.

**Promotion checks the repository.** `scripts/staging-image.sh` refuses an
image staging serves unless it is in `rebel-match-release`. A rollback digest
is looked up only there, so it can only name a build of `main`. The workflows
already read `GCP_IMAGE_REPO` and `GCP_DEPLOY_SA` by environment, so they do
not change; the variables do.

## Alternatives considered

- **Build provenance (signed attestations) checked at promotion.** This is
  stronger, but needs a policy engine or a verifier step, and its own setup.
  It can follow once the summit is over.
- **Immutable tags, with promotion checking that a tag is a commit on
  `main`.** A preview could still claim the tag of a `main` commit that never
  got an image, and the preview identity could still write where production
  reads.
- **Scoping `github-deployer` to preview resources with IAM conditions.**
  Cloud Run's create permissions are project-wide, so this does not hold on its
  own. It is unnecessary once production reads nothing a preview can write.

## Consequences

- An unreviewed branch can no longer reach production. The preview identity
  can still redeploy staging, but only with images in a repository production
  never reads, and a promotion of that is refused.
- The preview identity can still read non-prod's secrets through the runtime
  account. Non-prod holds only fictional people, as ADR 0025 accepts.
- Rolling back reaches only images in `rebel-match-release`. Images built
  before this change sit in `rebel-match`, so the first promotion after it
  needs a merge to `main` first.
- There are two repositories to clean up, and two deployers to keep in mind
  when changing grants.

## References

Requirements: `R-NFR-1`. ADRs 0025, 0028, 0044. `docs/cloud-setup.md` §3, §7,
§8, §10, §15, §18.
