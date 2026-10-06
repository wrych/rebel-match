# 0026. Make analytics opt-in, and send every event from the server

- **Status:** Accepted, amended by 0041
- **Date:** 2026-10-04
- **Deciders:** Andy Moesch

## Context

ADR 0005 chose Mixpanel and gated capture on "the consent recorded at
onboarding". That consent's words (version `2026-11-01`) never mention
analytics, so nobody has agreed to it yet. Folding analytics into the one
consent everyone must accept would make it a condition of joining, and under the
GDPR consent that is required to use a service it does not need is not freely
given. Summit attendees from the EU bring the GDPR with them, whatever the
Swiss law allows.

The spec also had UI events sent by `mixpanel-browser`. That script keeps an
identifier on the device, which is a further consent question (ePrivacy), and
ad blockers drop its calls.

## Decision

- **Analytics is opt-in.** Onboarding shows a separate, unticked checkbox under
  the consent, with its own versioned words. Ticking it records the analytics
  consent version and time on the member; leaving it unticked records nothing,
  and the member is never counted. The member can change the choice later in
  the app, as easily as they gave it.
- **Every event goes from our server to Mixpanel.** UI events (`journey_chosen`,
  `feedback_opened`) are posted to our own `/api/events`, which accepts only
  those names and their listed properties. No Mixpanel script, cookie or
  identifier reaches the browser, and the token stays on the server.
- An event is sent only for a member who is opted in at that moment. Events of
  visitors who cannot have opted in yet, such as `invite_rejected`, are not
  captured.
- Sending never fails or slows the request it describes: a Mixpanel error is
  reported without personal data and dropped. With no `MIXPANEL_TOKEN`, nothing
  is sent.

## Alternatives considered

- **Analytics inside the main consent** — every member counted, but consent
  bundled with joining is weak under GDPR Art. 7(4).
- **Legitimate interest with an opt-out** — near-full coverage and defensible
  for pseudonymous, cookie-less analytics, but it needs a legal assessment the
  beta does not need to wait for.
- **Opt-out checkbox, ticked by default** — pre-ticked boxes are not valid
  consent.
- **`mixpanel-browser` for UI events** — a third-party script and a device
  identifier, blocked by ad blockers; nothing it would capture needs the
  browser.

## Consequences

- Mixpanel sees only the members who tick the box, so its numbers are a sample,
  not a census; funnels read as rates among the opted-in.
- `members` gains `analytics_consent_version` and `analytics_consent_at`; both
  set means opted in. Withdrawing clears them.
- The analytics words are versioned like the consent words, and the server
  refuses a choice made against words other than the current ones.
- Funnel steps before onboarding, such as the first `login_completed`, are not
  seen; from then on they are.
- Amends ADR 0005, whose Mixpanel choice and EU residency stand.

## References

Amends ADR 0005. Requirements: R-ANA-1..5, R-ONB-3, R-NFR-6. Spec:
`specs/design.md` §2, §3, §7.
