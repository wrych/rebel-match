# 0040. Reuse a component before building a new one

- **Status:** Accepted
- **Date:** 2026-10-06
- **Deciders:** Andy Moesch

## Context

The redesign of onboarding into three steps drew its own step header, while the
Ask journey already had one (`AskSteps`) that looks different. Nothing in the
constitution says which is right. Its §4 warns against speculative abstraction
("two call sites do not justify a framework"), which can be read as an argument
for a second, local copy.

Members read a difference in look as a difference in meaning. Two step headers
suggest two kinds of journey where there is one idea: where am I, and how far is
it.

## Decision

The constitution's §4 gains a rule: **same thing, same component.**

- Where the app already shows a thing, such as a step header, a button, a card
  or a set of versioned words, a new screen uses the component that draws it.
- A component that does not quite fit is widened, with a prop or a slot, rather
  than copied.
- A second component for the same thing needs a hard reason, written in the pull
  request: a different job, not a different taste.
- This is reuse of what exists. The rule against speculative abstraction is
  about building for call sites that do not exist yet, and does not argue for a
  copy.

It is enforced by review, like the other design rules no linter can judge
(constitution §9).

## Alternatives considered

- **Leave it to the reviewer's taste** — it is what produced the second step
  header; a rule that is not written down is re-litigated (§8).
- **A component library or design-system package** — more than a beta with a
  November deadline needs, and speculative in exactly the sense §4 forbids.
- **A lint rule** — no linter can tell that two components draw the same thing.

## Consequences

- `AskSteps` becomes a step header that takes its labels, used by the Ask
  journey and by onboarding.
- Changing a shared component changes every screen that uses it. That is the
  point, and it means the tests of those screens run with the change.
- "Hard reason" will be argued. The pull request states it, and the reviewer
  can reject it.
- The reviewer agent judges one more rule.

## References

Constitution §4, §9. Requirements: R-LOOK-1, R-LOOK-3. Spec:
`specs/design.md` §1 (Look and colour modes).
