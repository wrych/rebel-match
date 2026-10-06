# Setting up Google Cloud

The one-time setup behind ADR 0025: the projects, a database in each, the
secrets the app reads, and the trust that lets GitHub Actions deploy without a
stored key. Afterwards every deploy is a workflow run; nobody types a `gcloud`
command again except to look.

It comes in the two parts of the ADR's rollout:

- **Part 1 — non-prod.** Previews and staging. A few francs a month, nearly all
  of it the database. Do this first; the deploy workflows build on it.
- **Part 2 — production.** When the pilot needs it. Nothing in part 1 is redone.

## Before you start

- A Google account with a **billing account** (console → Billing), and
  two-factor authentication on it: that login is the key to everything here.
- **Admin on `wrych/rebel-match`**, for the GitHub environments.
- A shell with `gcloud` and `openssl`. **Cloud Shell** (the `>_` icon in the
  console) has both, logged in. Locally: install the Google Cloud CLI, then
  `gcloud auth login`.

Run each part top to bottom in one shell: later steps use variables earlier
ones set. Project IDs are global across all of Google Cloud, so add a suffix
of your own.

```sh
export REGION=europe-west6                 # Zurich (ADR 0025)
export NONPROD=rebel-match-nonprod-<suffix>
export PROD=rebel-match-prod-<suffix>      # used only in part 2
export REPO=wrych/rebel-match
export BILLING=$(gcloud billing accounts list --format='value(name)' --limit=1)
echo "$BILLING"                            # check it is the account you meant

secret() { # secret <project> <name> — value on stdin, kept in Zurich only
  gcloud secrets create "$2" --project="$1" --data-file=- \
    --replication-policy=user-managed --locations="$REGION"
}
pool() { # pool <project> — the Workload Identity pool's resource name
  echo "projects/$(gcloud projects describe "$1" --format='value(projectNumber)')/locations/global/workloadIdentityPools/github"
}
```

Secrets use `user-managed` replication so their values stay in Zurich; the
default would copy them around the world.

---

# Part 1 — non-prod

## 1. Project, billing, budget alert

```sh
gcloud projects create "$NONPROD"
gcloud billing projects link "$NONPROD" --billing-account="$BILLING"
gcloud config set project "$NONPROD"

gcloud services enable billingbudgets.googleapis.com
gcloud billing budgets create --billing-account="$BILLING" \
  --display-name="$NONPROD" --budget-amount=20CHF \
  --filter-projects="projects/$NONPROD" \
  --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 \
  --threshold-rule=percent=1.0
```

The amount is in the billing account's currency; replace `CHF` if it is
another. A budget sends emails; it does not stop spending.

## 2. Turn on the services

```sh
gcloud services enable --project="$NONPROD" \
  run.googleapis.com sqladmin.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com \
  iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com \
  cloudresourcemanager.googleapis.com
```

## 3. Where images live

One Docker repository, in non-prod. Previews and staging push there; production
will pull the same images from it, so it never builds its own (ADR 0025, "build
once").

```sh
gcloud artifacts repositories create rebel-match --project="$NONPROD" \
  --location="$REGION" --repository-format=docker \
  --description="Rebel Match images, one per commit"
```

## 4. Database

Postgres 17 needs `--edition=enterprise` for the small shared-core machines;
without it Cloud SQL picks Enterprise Plus, which does not offer them. This
takes several minutes.

```sh
# Smallest machine, no backups: it holds only fictional people.
gcloud sql instances create rebel-match --project="$NONPROD" \
  --region="$REGION" --database-version=POSTGRES_17 --edition=enterprise \
  --tier=db-f1-micro --storage-size=10 --storage-auto-increase --no-backup

NONPROD_DB_PASSWORD=$(openssl rand -hex 24)
gcloud sql databases create staging --instance=rebel-match --project="$NONPROD"
gcloud sql users create rebel --instance=rebel-match --project="$NONPROD" \
  --password="$NONPROD_DB_PASSWORD"
```

Staging gets its database here; the preview workflow creates one per pull
request, `pr-<n>`, and drops it on close. The instance authorizes no networks,
so the only ways in are Cloud Run's built-in Cloud SQL connection and
`gcloud sql connect` for you.

**Stopping it when unused** saves most of non-prod's cost (storage is still
billed):

```sh
gcloud sql instances patch rebel-match --project="$NONPROD" --activation-policy=NEVER   # stop
gcloud sql instances patch rebel-match --project="$NONPROD" --activation-policy=ALWAYS  # start
```

## 5. Secrets

```sh
printf %s "$NONPROD_DB_PASSWORD" | secret "$NONPROD" db-password
printf %s "postgres://rebel:$NONPROD_DB_PASSWORD@/staging?host=/cloudsql/$NONPROD:$REGION:rebel-match" \
  | secret "$NONPROD" staging-database-url
openssl rand -hex 32 | tr -d '\n' | secret "$NONPROD" session-secret
unset NONPROD_DB_PASSWORD
```

Hex passwords need no escaping inside a URL. The preview workflow builds each
`pr-<n>` URL from `db-password`. There is no SMTP secret: previews and staging
never send mail (ADR 0025).

**Secret Manager is the only copy, and that is enough.** Read a value with
`gcloud secrets versions access latest --secret=db-password`. Lost or leaked,
a project owner resets it with `gcloud sql users set-password rebel
--instance=rebel-match --password=<new>`, then adds a new version of both
`db-password` and `staging-database-url` (`gcloud secrets versions add
<name> --data-file=-`). A second copy elsewhere would only go stale.

## 6. The identity the app runs as

Allowed to read its own project's secrets and reach its database, and nothing
else.

```sh
gcloud iam service-accounts create rebel-match-run --project="$NONPROD" \
  --display-name="Rebel Match at runtime"
for ROLE in roles/secretmanager.secretAccessor roles/cloudsql.client; do
  gcloud projects add-iam-policy-binding "$NONPROD" --condition=None \
    --member="serviceAccount:rebel-match-run@$NONPROD.iam.gserviceaccount.com" \
    --role="$ROLE"
done
```

## 7. The identity GitHub deploys as

It deploys, hands the runtime identity to what it deploys, pushes images, and
creates and drops preview databases. No predefined role does the last part
and nothing more (Cloud SQL Editor can create a database but not drop one),
so it gets a small custom role with just those permissions.

```sh
DEPLOYER=github-deployer@$NONPROD.iam.gserviceaccount.com
gcloud iam service-accounts create github-deployer --project="$NONPROD" \
  --display-name="GitHub Actions deploys"

gcloud iam roles create previewDatabases --project="$NONPROD" \
  --title="Preview databases" \
  --description="Create and drop the pr-<n> databases of pull-request previews" \
  --permissions=cloudsql.databases.create,cloudsql.databases.delete,cloudsql.databases.get,cloudsql.databases.list,cloudsql.instances.get \
  --stage=GA

for ROLE in roles/run.admin "projects/$NONPROD/roles/previewDatabases"; do
  gcloud projects add-iam-policy-binding "$NONPROD" --condition=None \
    --member="serviceAccount:$DEPLOYER" --role="$ROLE"
done
gcloud iam service-accounts add-iam-policy-binding \
  "rebel-match-run@$NONPROD.iam.gserviceaccount.com" --project="$NONPROD" \
  --member="serviceAccount:$DEPLOYER" --role=roles/iam.serviceAccountUser
gcloud artifacts repositories add-iam-policy-binding rebel-match \
  --project="$NONPROD" --location="$REGION" \
  --member="serviceAccount:$DEPLOYER" --role=roles/artifactregistry.writer
```

## 8. Let GitHub in without a key

Workload Identity Federation: GitHub Actions presents a short-lived token that
says which repository and which environment a job runs in, and Google trades it
for a few minutes as `github-deployer`. No key is created, so none can leak.

The provider accepts only tokens from this repository; the bindings accept only
jobs in the `dev` or `staging` GitHub environment.

```sh
gcloud iam workload-identity-pools create github --project="$NONPROD" \
  --location=global --display-name="GitHub Actions"
gcloud iam workload-identity-pools providers create-oidc rebel-match \
  --project="$NONPROD" --location=global --workload-identity-pool=github \
  --display-name="wrych/rebel-match" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.environment=assertion.environment" \
  --attribute-condition="assertion.repository == '$REPO'"

for ENV in dev staging; do
  gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER" \
    --project="$NONPROD" --role=roles/iam.workloadIdentityUser \
    --member="principalSet://iam.googleapis.com/$(pool "$NONPROD")/attribute.environment/$ENV"
done
```

## 9. GitHub environments

In the repository: **Settings → Environments → New environment**.

| Environment | Protection                                                    |
| ----------- | ------------------------------------------------------------- |
| `dev`       | none — every pull request deploys a preview                   |
| `staging`   | **Deployment branches and tags → Selected branches → `main`** |

Pull requests deploy previews with non-prod credentials and run the pull
request's own code, so anyone who can push a branch can deploy to non-prod.
That is the repository's collaborators, and non-prod holds nothing real.
GitHub gives no token to pull requests from forks, so those get no preview.

## 10. What the workflows need

```sh
echo "GCP_REGION=$REGION"
echo "GCP_IMAGE_REPO=$REGION-docker.pkg.dev/$NONPROD/rebel-match"
echo "GCP_PROJECT=$NONPROD"
echo "GCP_WIF_PROVIDER=$(pool "$NONPROD")/providers/rebel-match"
echo "GCP_DEPLOY_SA=$DEPLOYER"
echo "GCP_RUN_SA=rebel-match-run@$NONPROD.iam.gserviceaccount.com"
echo "GCP_SQL_INSTANCE=$NONPROD:$REGION:rebel-match"
```

Add them as **variables** (not secrets — none is sensitive) under **Settings →
Secrets and variables → Actions → Variables**: `GCP_REGION` and
`GCP_IMAGE_REPO` on the **repository**, the other five on **both** `dev` and
`staging`. The names must match exactly; the workflows read them by name.

## 11. Check

```sh
gcloud iam workload-identity-pools providers describe rebel-match \
  --project="$NONPROD" --location=global --workload-identity-pool=github \
  --format='value(state,attributeCondition)'
# ACTIVE  assertion.repository == 'wrych/rebel-match'
gcloud sql instances describe rebel-match --project="$NONPROD" --format='value(state)'
# RUNNABLE
```

## 12. How deploys run

Nothing more to set up: from here the workflows do it.

- **A pull request with the `preview` label** gets a preview once `check` and
  `build` are green (ADR 0028): the image `build` made is pushed, database
  `pr-<n>` is created, migrated and seeded with the fictional roster, and a
  tagged revision of `rebel-match-dev` serves it at its own
  `https://pr-<n>---rebel-match-dev-….a.run.app` address, given in the run's
  summary. Each push while the label is on redeploys it. Removing the label,
  or closing the pull request, removes the tag, its jobs and its database
  (`preview-cleanup.yml`). Without the label a pull request runs `check` and
  `build` only. Create the label once under **Issues → Labels → New label**,
  named `preview`.
- **A merge to `main`** does the same for `rebel-match-staging`, on database
  `staging`, at `https://rebel-match-staging-<project number>.europe-west6.run.app`.
- **Signing in:** previews and staging send no mail, so the first sign-in is
  the **dev-login** workflow (Actions → dev-login → Run workflow), with target
  `staging` or `pr-<n>`. It runs that target's sign-in job (R-DEV-6); the link
  is in the job's log in Google Cloud, which the run's summary links to, and
  never in GitHub. As the dev admin you can then read further links in the
  outbox.

Magic links in the outbox point at the addresses above. A `PUBLIC_URL`
variable on an environment overrides that, for a custom domain later.

Analytics is off until an environment has a `MIXPANEL_TOKEN` variable, the
token of the EU-residency Mixpanel project (ADR 0005); the next deploy passes
it to the service. It is not a secret: it can only send events.

The `db-f1-micro` instance allows about 25 connections. Each preview runs at
most one instance, which lets go of its connections when it scales to zero,
so a handful of open pull requests is fine; dozens at once are not.

### Where to look

Health, logs and, once it exists, the uptime check. Everything here is in the
non-prod project; production (part 2) has the same under its own project and
the service `rebel-match`.

- **Is it up?** `GET /api/health` answers `{"status":"ok","database":"up"}`
  without signing in. After each deploy `scripts/deploy.sh` checks it for about
  a minute and fails the deploy if the database never reports up; nothing checks
  it afterwards. An uptime check is proposed in pull request #119; once created
  it shows under **Monitoring → Uptime checks**, with a pass/fail history per
  region and the alert policy it feeds.

  ```sh
  curl -s https://rebel-match-staging-<project number>.europe-west6.run.app/api/health
  ```

- **Request log.** Cloud Run records every request on its own: method, path,
  status, latency and client address, with no code in the app. In the console
  it is the **Logs** tab of the service under **Cloud Run**, or **Logging →
  Logs Explorer** with a query such as

  ```
  resource.type="cloud_run_revision"
  resource.labels.service_name="rebel-match-staging"
  httpRequest.status>=500
  ```

  Drop the last line for all traffic. Previews share `rebel-match-dev`; add
  `resource.labels.revision_name` for the revision a `pr-<n>` tag points at,
  which `gcloud run services describe rebel-match-dev --format=json` lists
  under `status.traffic`. From a shell:

  ```sh
  gcloud run services logs read rebel-match-staging \
    --project="$NONPROD" --region="$REGION" --limit=100
  ```

- **The app's own lines.** Few, by design (constitution §5): what the server
  prints at start, and one warning when the analytics send, the settings
  refresh, the erasure sweep or the outbox purge fails. An error inside a
  request appears in the request log as its status and nothing more. A log
  line per failed request, with a request id the 500 response also carries,
  is proposed in pull request #118; the same Logs Explorer query will
  then show it, and no line holds an email address, a name or a challenge's
  words.

- **Job logs.** The migrate-and-seed job and the sign-in job are under **Cloud
  Run → Jobs → `prepare-<target>` / `login-<target>` → Executions**; each
  execution has its own log. The dev-login workflow's summary links straight to
  the sign-in job's log, which is where the magic link is printed (R-DEV-6).

---

# Part 2 — production

When the pilot needs it (ADR 0025, rollout step 2). Set the variables and
functions from "Before you start" again in a new shell.

## 13. Project, billing, budget alert, services

```sh
gcloud projects create "$PROD"
gcloud billing projects link "$PROD" --billing-account="$BILLING"
gcloud billing budgets create --billing-account="$BILLING" \
  --display-name="$PROD" --budget-amount=60CHF \
  --filter-projects="projects/$PROD" \
  --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 \
  --threshold-rule=percent=1.0
gcloud services enable --project="$PROD" \
  run.googleapis.com sqladmin.googleapis.com secretmanager.googleapis.com \
  iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com \
  cloudresourcemanager.googleapis.com compute.googleapis.com
```

## 14. The two grants on non-prod

Production pulls staging's images, and its deployer reads which digest staging
serves — nothing more of non-prod.

```sh
PROD_NUMBER=$(gcloud projects describe "$PROD" --format='value(projectNumber)')
gcloud artifacts repositories add-iam-policy-binding rebel-match \
  --project="$NONPROD" --location="$REGION" \
  --member="serviceAccount:service-$PROD_NUMBER@serverless-robot-prod.iam.gserviceaccount.com" \
  --role=roles/artifactregistry.reader
```

The `serverless-robot-prod` account appears once the Run API is enabled (§13).
If the binding says it does not exist yet, wait a minute and run it again. The
second grant follows the deployer's creation in §17.

## 15. Database

A bit more room than non-prod, nightly backups, point-in-time recovery, and
protection against deletion.

```sh
gcloud sql instances create rebel-match --project="$PROD" \
  --region="$REGION" --database-version=POSTGRES_17 --edition=enterprise \
  --tier=db-g1-small --storage-size=10 --storage-auto-increase \
  --backup-start-time=02:00 --enable-point-in-time-recovery \
  --deletion-protection

PROD_DB_PASSWORD=$(openssl rand -hex 24)
gcloud sql databases create rebel_match --instance=rebel-match --project="$PROD"
gcloud sql users create rebel --instance=rebel-match --project="$PROD" \
  --password="$PROD_DB_PASSWORD"
```

## 16. Secrets

```sh
printf %s "postgres://rebel:$PROD_DB_PASSWORD@/rebel_match?host=/cloudsql/$PROD:$REGION:rebel-match" \
  | secret "$PROD" database-url
openssl rand -hex 32 | tr -d '\n' | secret "$PROD" session-secret
unset PROD_DB_PASSWORD

printf %s '<the SMTP password>' | secret "$PROD" smtp-password
gcloud secrets create seed-whitelist --project="$PROD" --data-file=whitelist.csv \
  --replication-policy=user-managed --locations="$REGION"
gcloud secrets create seed-challenges --project="$PROD" --data-file=challenges.csv \
  --replication-policy=user-managed --locations="$REGION"
```

The two seed files are the real attendee whitelist and collected challenges
(R-SEED-5, `specs/design.md` §6.4). They never enter the repository, only
Secret Manager; delete your local copies afterwards.

## 17. Identities

```sh
PROD_DEPLOYER=github-deployer@$PROD.iam.gserviceaccount.com

gcloud iam service-accounts create rebel-match-run --project="$PROD" \
  --display-name="Rebel Match at runtime"
for ROLE in roles/secretmanager.secretAccessor roles/cloudsql.client; do
  gcloud projects add-iam-policy-binding "$PROD" --condition=None \
    --member="serviceAccount:rebel-match-run@$PROD.iam.gserviceaccount.com" \
    --role="$ROLE"
done

gcloud iam service-accounts create github-deployer --project="$PROD" \
  --display-name="GitHub Actions deploys"
gcloud projects add-iam-policy-binding "$PROD" --condition=None \
  --member="serviceAccount:$PROD_DEPLOYER" --role=roles/run.admin
gcloud iam service-accounts add-iam-policy-binding \
  "rebel-match-run@$PROD.iam.gserviceaccount.com" --project="$PROD" \
  --member="serviceAccount:$PROD_DEPLOYER" --role=roles/iam.serviceAccountUser

# The second grant on non-prod (§14): read which digest staging serves.
gcloud projects add-iam-policy-binding "$NONPROD" --condition=None \
  --member="serviceAccount:$PROD_DEPLOYER" --role=roles/run.viewer
```

## 18. Let GitHub in — production environment only

```sh
gcloud iam workload-identity-pools create github --project="$PROD" \
  --location=global --display-name="GitHub Actions"
gcloud iam workload-identity-pools providers create-oidc rebel-match \
  --project="$PROD" --location=global --workload-identity-pool=github \
  --display-name="wrych/rebel-match" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.environment=assertion.environment" \
  --attribute-condition="assertion.repository == '$REPO'"

gcloud iam service-accounts add-iam-policy-binding "$PROD_DEPLOYER" \
  --project="$PROD" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/$(pool "$PROD")/attribute.environment/production"
```

This is the line that keeps a pull request away from production: only a job in
the `production` environment, which waits for your approval, gets this
identity.

## 19. The production environment on GitHub

**Settings → Environments → New environment → `production`**: **Required
reviewers → you**; **Deployment branches → `main`**; leave **Prevent
self-review** unticked if you work alone. On a private repository, required
reviewers need a paid GitHub plan; if the option is missing, that is why, and
it has to be solved before production goes live.

Its variables:

```sh
echo "GCP_PROJECT=$PROD"
echo "GCP_WIF_PROVIDER=$(pool "$PROD")/providers/rebel-match"
echo "GCP_DEPLOY_SA=$PROD_DEPLOYER"
echo "GCP_RUN_SA=rebel-match-run@$PROD.iam.gserviceaccount.com"
echo "GCP_SQL_INSTANCE=$PROD:$REGION:rebel-match"
```

Plus `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_USER` and `MAIL_FROM`, from
`docs/email-setup.md`, and `TRUST_PROXY=1`. Production refuses to start with
`TRUST_PROXY=0` or an http `PUBLIC_URL` (ADR 0034): without the first, every
visitor shares the proxy's per-IP limits; without the second, the session
cookie loses `Secure`. Behind the load balancer of step 20 there is one more
hop; if the per-IP limits then count everyone together, raise it to `2`. If the SMTP server accepts relaying by sender IP rather
than by login, it needs a fixed address to allow; that is Cloud NAT, and a
separate step (ADR 0025, consequences).

## 20. Domain, and the first real sign-in

- **Own domain:** a global external Application Load Balancer in front of the
  service, with a Google-managed certificate. In the console: **Network
  services → Load balancing → Create → Application Load Balancer (HTTP/S) →
  Global**; backend **Serverless network endpoint group → Cloud Run →
  `rebel-match`** in `europe-west6`; frontend **HTTPS**, IP **reserve a new
  static address**, certificate **Google-managed** for your domain. Point the
  domain's `A` record at the reserved address; the certificate becomes active
  within an hour of DNS resolving. Set production's `PUBLIC_URL` variable to
  `https://<your domain>`.
- **Then one real sign-in** from a team mailbox. Staging never sends mail, so
  this is the first time the SMTP path runs.

---

## Cleaning up old images

Every deploy pushes an image, one per commit. Layers are shared, so each adds
only what changed, but the repository never shrinks by itself; there is
deliberately no automatic cleanup. Look now and then (storage beyond 0.5 GB
costs about $0.10 per GB a month), and clear out old images by hand:

```sh
REPO="$REGION-docker.pkg.dev/$NONPROD/rebel-match/app"

# How big the repository is, and what is in it, newest first.
gcloud artifacts repositories describe rebel-match --project="$NONPROD" \
  --location="$REGION" --format='value(sizeBytes)'
gcloud artifacts docker images list "$REPO" --include-tags --sort-by=~updateTime

# Images older than 30 days: count them, then delete them.
CUTOFF=$(date -u -d '30 days ago' +%Y-%m-%dT%H:%M:%SZ)
OLD=$(gcloud artifacts docker images list "$REPO" \
  --filter="updateTime<'$CUTOFF'" --format='value(version)')
echo "$OLD" | grep -c sha256
for DIGEST in $OLD; do
  gcloud artifacts docker images delete "$REPO@$DIGEST" --delete-tags --quiet
done
```

Staging is redeployed on every merge and a preview on every push, so what
they run is newer than any sensible cutoff. A pull request left untouched for
longer may not start its preview again after its image is gone; pushing to it
redeploys. Once production exists (part 2), keep every image it may roll back
to: check what it runs before deleting.

## Taking it down

```sh
gcloud projects delete "$NONPROD"
# and, if part 2 was done:
gcloud sql instances patch rebel-match --project="$PROD" --no-deletion-protection
gcloud projects delete "$PROD"
```

Billing stops at once; a deleted project can be restored for 30 days.
