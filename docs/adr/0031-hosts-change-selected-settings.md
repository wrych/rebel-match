# 0031. Hosts change selected settings in the app, stored in the database

- **Status:** Accepted, amended by 0045
- **Date:** 2026-10-04
- **Deciders:** Andy Moesch

## Context

Every tunable lives in configuration read from the environment (R-CFG-1), and
the host tools show it read-only (R-CFG-5). At the summit the hosts may need to
loosen a spam limit for a crowded room, or lengthen an invite, within minutes;
a redeploy needs someone with Google Cloud access and takes several minutes.
Some values must never move that way: secrets, where the app runs, and limits
the database's column widths fix.

## Decision

- **What can change in the app:** the spam-protection numbers except the
  trusted proxies, the invite defaults, and the minimum challenge and "been
  there" note lengths. Each has bounds in code; a value outside them, or a
  pair out of order (a ceiling below its free uses), is refused.
- **Who:** holders of a new `settings:manage` permission, given to admins.
- **Where it is kept:** a `setting_overrides` table, one row per changed value
  with who changed it and when. Precedence: a value set in the app, else the
  environment, else the default. Going back to the deployment's value deletes
  the row.
- **When it takes effect:** at once on the server that saved it, and on every
  other server within `SETTINGS_REFRESH_SECONDS` (60), which re-reads the table.
- Everything else stays a deployment change.

## Alternatives considered

- **Only through the environment** — safe, but slow when a room is waiting.
- **Every setting editable** — puts secrets and infrastructure within a click,
  and lets a host set a length the database cannot store.
- **A history table of every change** — a full audit trail, but the beta needs
  only the last change; the row records who and when.

## Consequences

- The Settings screen becomes partly editable, and says for each changed value
  who changed it, when, and what the deployment would use instead.
- Code that read these values once at startup reads them when it uses them.
- For up to a minute two servers can apply different values.
- Only the latest change is kept, not the history.

## References

Requirements: R-CFG-5, R-CFG-6, R-NFR-8. Amends nothing; builds on ADR 0029,
ADR 0030. Spec: `specs/design.md` §1, §2, §3, the settings screen.
