# 0005. Mixpanel with EU data residency for product analytics

- **Status:** Accepted, amended by 0026 (opt-in; server-only sending)
- **Date:** 2026-10-01
- **Deciders:** Andy Moesch

## Context

The team wants to see how the summit crowd actually uses the app: which journey
people pick, where they drop off, whether onboarding fits in two minutes. That
is event analytics with funnels, not pageview counting. The original spec chose
PostHog on the assumption that Mixpanel's free tier would not do, and that EU
hosting might cost extra.

Checking the terms changed the picture: Mixpanel's free plan covers 1M
events/month with unlimited seats, and EU data residency is available at no
extra cost with no plan gate — which is far above summit scale (~350 members).

## Decision

Mixpanel, free tier, with an **EU-residency project**. Identify members by a
pseudonymous `analytics_id`; never send challenge text, names, or email
addresses. Capture is gated on the consent recorded at onboarding.

## Alternatives considered

- **PostHog** — comparable free tier, EU cloud, self-host option. Kept as the
  fallback if Mixpanel's terms change before launch.
- **Umami / Plausible** — privacy-friendly but pageview-oriented; weak for
  funnels and retention, which is the whole question being asked.
- **Matomo / Countly (community)** — self-hosted, heavier to operate than the
  value justifies here.

## Consequences

- **Residency is chosen at project creation and cannot be changed.** A wrong
  choice means a new project and abandoning the data.
- **Every call must target the EU endpoints** (`api-eu.mixpanel.com` for
  ingestion, `eu.mixpanel.com` for queries). Data sent to the default US
  endpoints is stored in the US even for an EU project — so the host is
  configuration, checked in review.
- R-ANA-5 tightened from "SHOULD support EU hosting" to "SHALL store event data
  in the EU", since the constraint turned out to be free.
- A third-party processor must be covered by the consent copy (R-ANA-4).

## References

Requirements: R-ANA-1..5. Spec: `specs/design.md` §7. Sources:
<https://mixpanel.com/pricing/>, <https://docs.mixpanel.com/docs/privacy>
