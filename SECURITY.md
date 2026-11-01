# Security policy

Rebel Match holds what members trust it with: the challenges they face at work,
often sensitive, and their contact details, shared only after both sides agree.
We take a report that puts either at risk seriously and are grateful for it.

## Reporting a vulnerability

**Email [hello@rebel-match.com](mailto:hello@rebel-match.com).** Please do not
open a public issue, pull request or discussion for a vulnerability.

Include what you can of:

- what an attacker could do, and to whom;
- the steps, request or code that shows it;
- the commit or deployment you found it on — the version shown in the app's menu
  names the build;
- whether you want to be credited, and how.

We will confirm we received your report, keep you informed while we work on a
fix, and tell you when it is deployed. Please give us a reasonable time to fix
it before you disclose it, and we will agree a disclosure date with you.

## Supported versions

Only the latest commit on `main`, and the production deployment built from it,
receive security fixes. There are no maintained release branches.

## Scope

Most welcome are reports of:

- reading another member's contact details without an accepted connection, or
  any other way around the double opt-in;
- signing in as someone else, or reusing, guessing or forging a magic link,
  session or invite link;
- doing something your role does not permit, including reaching a host tool;
- personal data — an email, a name, a challenge's text — leaking into a log, an
  error, a mail or analytics;
- injection, cross-site scripting or request forgery anywhere in the app.

Out of scope are denial of service by volume, social engineering of members or
the team, findings that need a compromised device, and reports from automated
scanners without a demonstrated impact.

## Testing in good faith

Test against a copy you run yourself: `npm ci && npm run dev` starts the full app
on fictional data, with no setup (see [`AGENTS.md`](AGENTS.md#first-run)). Do
not test against production, do not access or change data that is not yours, and
stop and tell us as soon as you reach someone else's. We will not pursue anyone
who follows this policy in good faith.
