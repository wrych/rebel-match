# Setting up Google Cloud

The one-time setup behind ADR 0025: two projects, a database in each, the
secrets the app reads, and the trust that lets GitHub Actions deploy without a
stored key. Do it once, top to bottom. Afterwards every deploy is a workflow
run; nobody types a `gcloud` command again except to look.

The deploy workflows themselves land in the next pull request. This page ends
with the values they need (§10).

## 0. Before you start

- A Google account with a **billing account** (console → Billing). New accounts
  get trial credit; the setup costs tens of francs a month after that.
- **Admin on `wrych/rebel-match`**, for the environments in §9.
- A shell with `gcloud`. **Cloud Shell** (the `>_` icon in the console) has it
  already, logged in. Locally: install the Google Cloud CLI, then
  `gcloud auth login`.
- `openssl`, for generating passwords. Cloud Shell has it.

Every command below reads these variables. Set them in each new shell.
Project IDs are global across all of Google Cloud, so add a suffix of your own.

```sh
export REGION=europe-west6                 # Zurich (ADR 0025)
export NONPROD=rebel-match-nonprod-<suffix>
export PROD=rebel-match-prod-<suffix>
export REPO=wrych/rebel-match
export BILLING=$(gcloud billing accounts list --format='value(name)' --limit=1)
echo "$BILLING"                            # check it is the account you meant
```

## 1. Projects and billing

```sh
for P in $NONPROD $PROD; do
  gcloud projects create "$P"
  gcloud billing projects link "$P" --billing-account="$BILLING"
done
gcloud config set project "$NONPROD"   # the default for anything unscoped
```

**Budget alerts**, so a mistake costs an email rather than a surprise. Amounts
are in your billing account's currency; replace `CHF` if it is another.

```sh
gcloud services enable billingbudgets.googleapis.com --project="$NONPROD"
for P in $NONPROD $PROD; do
  gcloud billing budgets create --billing-account="$BILLING" \
    --display-name="$P" --budget-amount=50CHF \
    --filter-projects="projects/$P" \
    --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 \
    --threshold-rule=percent=1.0
done
```

## 2. Turn on the services

```sh
for P in $NONPROD $PROD; do
  gcloud services enable --project="$P" \
    run.googleapis.com sqladmin.googleapis.com \
    artifactregistry.googleapis.com secretmanager.googleapis.com \
    iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com \
    cloudresourcemanager.googleapis.com
done
```

This takes a minute or two. Production also needs `compute.googleapis.com`,
for the load balancer in §11; that can wait.

## 3. Where images live

One Docker repository, in non-prod. Staging pushes there; production pulls the
same image from there, so it never builds its own (ADR 0025, "build once").

```sh
gcloud artifacts repositories create rebel-match --project="$NONPROD" \
  --location="$REGION" --repository-format=docker \
  --description="Rebel Match images, one per commit"

# Production's Cloud Run may pull from it.
PROD_NUMBER=$(gcloud projects describe "$PROD" --format='value(projectNumber)')
gcloud artifacts repositories add-iam-policy-binding rebel-match \
  --project="$NONPROD" --location="$REGION" \
  --member="serviceAccount:service-$PROD_NUMBER@serverless-robot-prod.iam.gserviceaccount.com" \
  --role=roles/artifactregistry.reader
```

The `serverless-robot-prod` account exists once the Run API is enabled (§2). If
the binding says it does not exist yet, wait a minute and run it again.

## 4. Databases

Postgres 17 needs `--edition=enterprise` for the small shared-core machines;
without it Cloud SQL picks Enterprise Plus, which does not offer them.

```sh
# Non-prod: smallest machine, no backups — it holds only fictional people.
gcloud sql instances create rebel-match --project="$NONPROD" \
  --region="$REGION" --database-version=POSTGRES_17 --edition=enterprise \
  --tier=db-f1-micro --storage-size=10 --storage-auto-increase --no-backup

# Production: a bit more room, nightly backups, point-in-time recovery.
gcloud sql instances create rebel-match --project="$PROD" \
  --region="$REGION" --database-version=POSTGRES_17 --edition=enterprise \
  --tier=db-g1-small --storage-size=10 --storage-auto-increase \
  --backup-start-time=02:00 --enable-point-in-time-recovery \
  --deletion-protection
```

Each takes several minutes. Neither instance gets authorized networks, so the
only way in is Cloud Run's built-in Cloud SQL connection (and `gcloud sql
connect`, for you).

Now a database and a user in each. Staging gets its database here; the preview
workflow creates one per pull request, `pr-<n>`, and drops it on close.

```sh
NONPROD_DB_PASSWORD=$(openssl rand -hex 24)
PROD_DB_PASSWORD=$(openssl rand -hex 24)

gcloud sql databases create staging --instance=rebel-match --project="$NONPROD"
gcloud sql users create rebel --instance=rebel-match --project="$NONPROD" \
  --password="$NONPROD_DB_PASSWORD"

gcloud sql databases create rebel_match --instance=rebel-match --project="$PROD"
gcloud sql users create rebel --instance=rebel-match --project="$PROD" \
  --password="$PROD_DB_PASSWORD"
```

Hex passwords need no escaping inside a URL. The passwords stay in this shell
only until §5 puts them in Secret Manager; do not write them down elsewhere.

## 5. Secrets

Secret values are kept in Zurich only (`user-managed` replication); the default
would copy them around the world.

```sh
secret() { # secret <project> <name> — value on stdin
  gcloud secrets create "$2" --project="$1" --data-file=- \
    --replication-policy=user-managed --locations="$REGION"
}

NONPROD_SQL="$NONPROD:$REGION:rebel-match"
PROD_SQL="$PROD:$REGION:rebel-match"

# Non-prod. The preview workflow builds each pr-<n> URL from the password.
printf %s "$NONPROD_DB_PASSWORD" | secret "$NONPROD" db-password
printf %s "postgres://rebel:$NONPROD_DB_PASSWORD@/staging?host=/cloudsql/$NONPROD_SQL" \
  | secret "$NONPROD" staging-database-url
openssl rand -hex 32 | tr -d '\n' | secret "$NONPROD" session-secret

# Production.
printf %s "postgres://rebel:$PROD_DB_PASSWORD@/rebel_match?host=/cloudsql/$PROD_SQL" \
  | secret "$PROD" database-url
openssl rand -hex 32 | tr -d '\n' | secret "$PROD" session-secret

unset NONPROD_DB_PASSWORD PROD_DB_PASSWORD
```

Production also needs the SMTP password and the two private seed files
(R-SEED-5, `specs/design.md` §6.4). Create them when you have them — the files
never enter the repository, only Secret Manager:

```sh
printf %s '<the SMTP password>' | secret "$PROD" smtp-password
gcloud secrets create seed-whitelist --project="$PROD" --data-file=whitelist.csv \
  --replication-policy=user-managed --locations="$REGION"
gcloud secrets create seed-challenges --project="$PROD" --data-file=challenges.csv \
  --replication-policy=user-managed --locations="$REGION"
```

Non-prod gets no SMTP secret: staging and previews never send mail (ADR 0025).

## 6. The identity the app runs as

One service account per project, allowed to read its own secrets and reach its
own database, and nothing else.

```sh
for P in $NONPROD $PROD; do
  gcloud iam service-accounts create rebel-match-run --project="$P" \
    --display-name="Rebel Match at runtime"
  for ROLE in roles/secretmanager.secretAccessor roles/cloudsql.client; do
    gcloud projects add-iam-policy-binding "$P" --condition=None \
      --member="serviceAccount:rebel-match-run@$P.iam.gserviceaccount.com" \
      --role="$ROLE"
  done
done
```

## 7. The identity GitHub deploys as

A second service account per project, `github-deployer`. It deploys, and it may
hand the runtime identity to what it deploys.

```sh
for P in $NONPROD $PROD; do
  gcloud iam service-accounts create github-deployer --project="$P" \
    --display-name="GitHub Actions deploys"
  gcloud projects add-iam-policy-binding "$P" --condition=None \
    --member="serviceAccount:github-deployer@$P.iam.gserviceaccount.com" \
    --role=roles/run.admin
  gcloud iam service-accounts add-iam-policy-binding \
    "rebel-match-run@$P.iam.gserviceaccount.com" --project="$P" \
    --member="serviceAccount:github-deployer@$P.iam.gserviceaccount.com" \
    --role=roles/iam.serviceAccountUser
done
```

Then what differs between the two:

```sh
# Non-prod builds and pushes images, and creates and drops preview databases.
gcloud artifacts repositories add-iam-policy-binding rebel-match \
  --project="$NONPROD" --location="$REGION" \
  --member="serviceAccount:github-deployer@$NONPROD.iam.gserviceaccount.com" \
  --role=roles/artifactregistry.writer
gcloud projects add-iam-policy-binding "$NONPROD" --condition=None \
  --member="serviceAccount:github-deployer@$NONPROD.iam.gserviceaccount.com" \
  --role=roles/cloudsql.editor

# Production reads which image staging is serving, and nothing more of non-prod.
gcloud projects add-iam-policy-binding "$NONPROD" --condition=None \
  --member="serviceAccount:github-deployer@$PROD.iam.gserviceaccount.com" \
  --role=roles/run.viewer
```

## 8. Let GitHub in without a key

Workload Identity Federation: GitHub Actions presents a short-lived token that
says which repository and which environment a job runs in, and Google trades it
for a few minutes as `github-deployer`. No key is created, so none can leak.

A pool and a provider in each project. The provider accepts only tokens from
this repository.

```sh
for P in $NONPROD $PROD; do
  gcloud iam workload-identity-pools create github --project="$P" \
    --location=global --display-name="GitHub Actions"
  gcloud iam workload-identity-pools providers create-oidc rebel-match \
    --project="$P" --location=global --workload-identity-pool=github \
    --display-name="wrych/rebel-match" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.environment=assertion.environment" \
    --attribute-condition="assertion.repository == '$REPO'"
done
```

Then say which **GitHub environment** may become which deployer. This is the
line that keeps a pull request away from production: only a job running in the
`production` environment — which needs your approval (§9) — gets the
production deployer.

```sh
pool() { # pool <project> — the pool's resource name
  echo "projects/$(gcloud projects describe "$1" --format='value(projectNumber)')/locations/global/workloadIdentityPools/github"
}

for ENV in dev staging; do
  gcloud iam service-accounts add-iam-policy-binding \
    "github-deployer@$NONPROD.iam.gserviceaccount.com" --project="$NONPROD" \
    --role=roles/iam.workloadIdentityUser \
    --member="principalSet://iam.googleapis.com/$(pool "$NONPROD")/attribute.environment/$ENV"
done

gcloud iam service-accounts add-iam-policy-binding \
  "github-deployer@$PROD.iam.gserviceaccount.com" --project="$PROD" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/$(pool "$PROD")/attribute.environment/production"
```

The provider's condition already limits both to this repository, so the
environment is the only thing left to check.

## 9. GitHub environments

In the repository: **Settings → Environments → New environment**, three times.

| Environment  | Protection                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `dev`        | none — every pull request deploys a preview                                                                              |
| `staging`    | **Deployment branches and tags → Selected branches → `main`**                                                            |
| `production` | **Required reviewers → you**; **Deployment branches → `main`**; leave **Prevent self-review** unticked if you work alone |

The required reviewer is the promotion button: the workflow stops and waits for
your approval before it can even obtain production's credentials. On a private
repository, required reviewers need a paid GitHub plan; if the option is
missing, that is why, and it has to be solved before production is set up.

Pull requests deploy previews with real (non-prod) credentials and run the
pull request's own code, so anyone who can push a branch can deploy to non-prod.
That is the repository's collaborators, and non-prod holds nothing real.
GitHub gives no token to pull requests from forks, so those get no preview.

## 10. What the workflows need

Print the values, then add each as a **variable** (not a secret — none is
sensitive) under **Settings → Secrets and variables → Actions → Variables**, on
the environment named in the first column.

```sh
for P in $NONPROD $PROD; do
  echo "== $P"
  echo "GCP_PROJECT=$P"
  echo "GCP_WIF_PROVIDER=$(pool "$P")/providers/rebel-match"
  echo "GCP_DEPLOY_SA=github-deployer@$P.iam.gserviceaccount.com"
  echo "GCP_RUN_SA=rebel-match-run@$P.iam.gserviceaccount.com"
  echo "GCP_SQL_INSTANCE=$P:$REGION:rebel-match"
done
echo "GCP_REGION=$REGION"
echo "GCP_IMAGE_REPO=$REGION-docker.pkg.dev/$NONPROD/rebel-match"
```

| Variable                       | Set on                                |
| ------------------------------ | ------------------------------------- |
| `GCP_REGION`, `GCP_IMAGE_REPO` | the repository (all environments)     |
| the five non-prod values       | `dev` and `staging`                   |
| the five production values     | `production`                          |
| `PUBLIC_URL`                   | `staging` and `production`, after §11 |

Four more on `production`, which the workflow passes to the app as plain
configuration: `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_USER` and `MAIL_FROM`, from
`docs/email-setup.md`. If the SMTP server accepts relaying by sender IP rather
than by login, it needs a fixed address to allow; that is Cloud NAT, and a
separate step (ADR 0025, consequences).

**Check it worked** before the workflows exist:

```sh
gcloud iam workload-identity-pools providers describe rebel-match \
  --project="$PROD" --location=global --workload-identity-pool=github \
  --format='value(state,attributeCondition)'
# ACTIVE  assertion.repository == 'wrych/rebel-match'
```

## 11. After the first deploys

Cloud Run gives each service a `https://…run.app` address on its first deploy.

- **Staging:** set its `PUBLIC_URL` variable to that address, and redeploy.
- **First sign-in on staging:** run `dev:login` as a one-off job, as the
  workflow PR documents (R-DEV-6). The link appears in the job's log.
- **Production's own domain:** a global external Application Load Balancer in
  front of the service, with a Google-managed certificate. In the console:
  **Network services → Load balancing → Create → Application Load Balancer
  (HTTP/S) → Global**; backend **Serverless network endpoint group → Cloud Run →
  `rebel-match`** in `europe-west6`; frontend **HTTPS**, IP **reserve a new
  static address**, certificate **Google-managed** for your domain. Point the
  domain's `A` record at the reserved address; the certificate becomes active
  within an hour of DNS resolving. Then set production's `PUBLIC_URL` to
  `https://<your domain>`.
- **Then send one real sign-in** from a team mailbox on production. Staging
  never sends mail, so this is the first time the SMTP path is exercised.

## Taking it down

Production's instance has deletion protection. To remove everything:

```sh
gcloud sql instances patch rebel-match --project="$PROD" --no-deletion-protection
gcloud projects delete "$PROD"
gcloud projects delete "$NONPROD"
```

A deleted project can be restored for 30 days and is billed nothing meanwhile.
