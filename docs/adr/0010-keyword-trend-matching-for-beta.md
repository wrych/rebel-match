# 0010. Keyword-based trend matching for the beta

- **Status:** Accepted
- **Date:** 2026-10-01
- **Deciders:** Andy Moesch, Ivo Pejakovic, Pascal Dulex

## Context

A submitted challenge has to land in one of the 8 Corporate Rebels trends,
because the trend is what gathers peers and case studies around it. An LLM would
classify free text well — the meeting agreed *"AI will be pretty good at
matching"* — but it adds a vendor, a key, a per-request cost, latency inside the
two-minute onboarding budget, and a new place for challenge text to travel. The
prototype's weighted keyword scorer already worked well enough to demo.

## Decision

The beta classifies with the weighted keyword scorer: strong keywords score 6,
weak ones 1, highest total wins, and the member can override the result on the
next screen. The matcher sits behind a narrow interface so an LLM classifier can
replace it later without touching callers.

## Alternatives considered

- **LLM classification now** — better accuracy, but sends challenge text to a
  third party (which the privacy posture would have to cover), and risks the
  R-NFR-3 budget. Deferred, not rejected.
- **Member picks the trend themselves** — no matcher at all, but the auto-match
  is part of what makes the app feel smart, and people pick inconsistently.
- **Full-text search relevance** — more machinery than 8 fixed categories need.

## Consequences

- Classification quality is bounded by a hand-tuned keyword list, so the
  override path is essential rather than a nicety (R-ASK-7), and overrides are
  recorded — they are the training signal for the replacement.
- No vendor, no key, no latency, no challenge text leaving the server.
- The matcher is pure and cheap to unit-test, including ties and no-hit fallback
  (R-QA-1).
- Replacing it post-beta is an interface swap, not a rewrite.

## References

Requirements: R-ASK-5..7. Spec: `specs/design.md` §5. Backlog: C5.
