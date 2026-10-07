# 0041. Onboard in three steps; the notice is read, usage data is asked

- **Status:** Accepted, amended by 0043
- **Date:** 2026-10-06
- **Deciders:** Andy Moesch

## Context

Onboarding is one screen that mixes three things: the profile, the data-usage
consent with a required checkbox, and the optional analytics checkbox, which
sits lost at the bottom. Everything is sent in one request.

Three problems follow. The checkbox reads "I have read this and agree", which
presents the processing the app needs in order to work as consent, although it
does not rest on consent and cannot be withdrawn like one. The words do not say
who is responsible for the data or which rights a member has. And the optional
choice shares a screen, and a submit button, with the required one.

ADR 0026 made analytics opt-in with "a separate, unticked checkbox under the
consent". This decision keeps the opt-in and changes how it is asked.

## Decision

- **Three screens, each with a URL**: profile, privacy, usage data. All three
  carry the step header of the Ask journey (ADR 0040).
- **Nothing is sent or stored before the privacy step is confirmed.** What the
  member types on the profile step stays in the browser until then.
- **The privacy step shows a summary and links to the full notice**, a screen of
  its own at `/privacy`. The summary names who is responsible, what is kept, who
  sees it, what activity is recorded and the member's rights.
- **One button, "I have read the privacy notice"**, replaces the checkbox and
  the Continue button. It stores the profile and records the consent version and
  time as before (R-NFR-6). What is recorded is that the member was shown these
  words and confirmed reading them.
- **A scroll hint, not a scroll gate.** While the button is out of view a
  floating arrow scrolls down a little at a time. The button is never disabled
  for not having scrolled.
- **Usage data is asked on its own step**, after the member is onboarded, with
  two buttons of the same colour, size and weight: "Share usage data" and "No
  thanks". Sharing goes through `PUT /api/me/analytics`; `POST /api/onboarding`
  no longer carries an analytics choice.
- **`onboarding_completed` is sent when the member shares on that step**, since
  nobody is opted in at the moment the privacy step completes.
- **No back controls on the steps.** The browser's back returns from the privacy
  step to the profile step with what was typed.

## Alternatives considered

- **Keep one screen and restyle it** — the optional choice stays attached to the
  required one, and the profile still travels with the confirmation.
- **A required checkbox plus Continue on the privacy step** — two actions for
  one meaning, and the wording still reads as consent.
- **A highlighted "Agree" beside an outlined "Skip" on the usage step** —
  refusing must be as easy as accepting; unequal buttons are a nudge that
  weakens the consent ADR 0026 exists to get.
- **Disable the button until the summary is scrolled to its end** — proves
  scrolling, not reading, and blocks members whose screen already shows it all.
- **An arrow that jumps to the end** — takes the summary out of view in one tap.
- **Back buttons in the step header** — they change the header, which then no
  longer matches the Ask journey (ADR 0040).

## Consequences

- The summary is a **new consent version**, so every member confirms again on
  their next visit (R-ONB-4). The words cannot be written until the controller
  and contact are known (requirements §11, question 6).
- The usage step has **new analytics words**, so opt-ins given to the earlier
  words lapse until given again.
- Three screens instead of one count against the two-minute budget (R-NFR-3).
  Onboarding is timed again on a phone before the summit.
- `onboarding_completed` covers only members who share on the usage step. A
  member who declines, or opts in later on the profile screen, is not in it.
- A member who closes the app on the usage step is onboarded and not opted in,
  and is not asked again; the choice stays on the profile screen.
- The full privacy notice is a document somebody has to write and keep current
  (requirements §11, question 7). The wording of the button and the legal basis
  it implies are checked by whoever handles data protection before the summit.
- Amends ADR 0026: the opt-in is asked on a step of its own with two buttons,
  not with a checkbox under the consent. Its opt-in rule and server-side sending
  stand.

## References

Amends ADR 0026. Follows ADR 0007, ADR 0040. Requirements: R-ONB-1..12,
R-ANA-4, R-ANA-6, R-LOOK-4, R-NFR-3, R-NFR-6. Spec: `specs/flows.md` F2,
`specs/design.md` §1, §3, §4, §7.
