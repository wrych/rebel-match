## Why

<!-- The requirement this serves, and the ADR if a major decision authorized it.
     No requirement covers it? The spec changes first, in its own PR. -->

Requirement: R-
ADR:

## What changes

<!-- What a member, a host or a developer will notice. The diff shows the how. -->

## How it is tested

<!-- The tests that came with the change, and anything you checked by hand. -->

## Checklist

- [ ] One concern; no refactor riding along with a behavior change
- [ ] Tests in the same commit as the behavior they cover
- [ ] Permissions checked, never a role name in a conditional
- [ ] No email, name or challenge text in a log, an error or analytics
- [ ] No contact detail readable without an accepted connection
- [ ] Config values, not magic numbers; no comment saying what the code does
- [ ] Spec, ADR or `docs/` updated if this changes what they say

<!-- Want to try it on a phone? Ask for the `preview` label. -->
