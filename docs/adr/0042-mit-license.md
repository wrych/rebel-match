# 0042. Publish the code under the MIT license

- **Status:** Accepted
- **Date:** 2026-10-07
- **Deciders:** Andy Moesch

## Context

The project is to stay open source, and the code carries no license, which
leaves everyone but its authors without the right to use it. The least we ask
of anyone who uses it is attribution.

Rebel Match is a hosted app, not a library. Under most licenses, attribution
and source-sharing duties fall on whoever distributes copies of the code, not on
whoever runs it as a service. Every dependency in `package-lock.json` is under
a permissive or weak-copyleft license (MIT, ISC, Apache-2.0, BSD, MPL-2.0,
LGPL-3.0 and the like), so none of them constrains the choice.

## Decision

- **The code is published under the MIT license**, in `LICENSE` at the root.
- **The copyright line names the founders, Pascal Dulex, Ivo Pejakovic and
  Andy Moesch, and the Rebel Match contributors.** Every copy of the code then
  carries their names. A contribution is accepted under the same license; there
  is no contributor agreement.
- `package.json` names the license as `MIT`. It stays `private`, since the app
  is not published to npm.

## Alternatives considered

- **Apache-2.0** — attribution plus a patent grant and a NOTICE file; more
  ceremony than a project of this size needs.
- **MPL-2.0 or GPL-3.0** — require changes to be shared, but only on
  distribution, which a hosted fork never does.
- **AGPL-3.0** — the only common license whose duties reach a hosted copy; it
  would deter the organisations most likely to run one.

## Consequences

- Anyone may run, change and sell the app, including as a hosted service,
  without sharing their changes.
- Attribution means keeping the copyright and license notice in copies of the
  code. A hosted copy owes its users no credit; we cannot require one without
  moving to a different license.
- Contributors keep the copyright in their own contributions. Relicensing later
  needs the agreement of every contributor whose code remains, so the choice
  gets harder to reverse as contributions grow.
- Third-party assets keep their own licenses, such as the fonts under OFL-1.1.

## References

Requirements: R-NFR-12.
