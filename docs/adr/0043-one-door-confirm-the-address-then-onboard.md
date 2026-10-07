# 0043. One door: confirm the address, then onboard, then wait if need be

- **Status:** Accepted
- **Date:** 2026-10-07
- **Deciders:** Andy Moesch

## Context

Three kinds of people come through the login screen: members on the
whitelist, people joining through an invite link, and applicants nobody has
admitted yet. Today they take different paths. Whitelisted and invited people
get a sign-in link, then onboard. Applicants get no link at all (R-AUTH-2):
they land on the access-requested screen, may leave a name and organization
for the host, wait for a person to approve them, and only onboard once the
approval email's link brings them in.

That costs flows, screens and exceptions: the access-requested screen with its
own form, `requested_name` and `requested_org` with their pre-fill rules
(R-AUTH-12), and an applicant handle that lets the form write without a
session. It also wastes the applicant's time: they wait for a person with
nothing to do, then onboard afterwards.

Onboarding cannot simply move in front of the approval. The applicant has not
shown that the address is theirs, so consent recorded then could have been
given by anyone who typed it. And the privacy step's button, which accepts the
terms of use, needs to be a deliberate act by the owner of the account.

Everyone also waits at the door for their email to arrive, with nothing to do.

## Decision

- **Every address gets a sign-in link at the door**, unless it was rejected
  (R-AUTH-13). An unknown address without a usable invite is still recorded as
  a pending applicant, and still gets a link. The link confirms the address.
- **One screen after the email is submitted, the same for everyone**: check
  your email, and while you wait, tell us about you. It shows the profile form
  with the line "We keep what you enter here to set up your account. Privacy
  notice · Terms of use". Each field saves on change with the usual tick.
- **What is typed there is a draft**, kept in a table of its own and never read
  as the member's profile. The waiting screen writes it with a **draft token**:
  random, issued with each sign-in request, stored hashed, good for that one
  draft only, and spent when the draft is confirmed or a newer request
  replaces it. A draft is deleted once confirmed, when the applicant is
  rejected or the account erased, and otherwise after
  `limits.profileDraftRetentionDays`.
- **Onboarding starts where the draft leaves off.** With a name in the draft
  the link leads to the privacy step; without one, to the profile step,
  pre-filled with whatever was entered. The profile step saves to the same
  draft, field by field.
- **The privacy step shows a profile preview**: the member card other members
  see, drawn by the same component, with an Edit button back to the profile
  step. Nobody confirms a profile they have not seen, including one somebody
  else typed for their address.
- **One button still accepts the privacy notice and the terms.** It copies the
  draft into the profile and records the consent (R-ONB-8). Typing in the
  draft accepts nothing.
- **An applicant signs in like anyone else**, with a session that reaches only
  onboarding and a waiting screen. Hosts see an applicant once the address is
  confirmed, with the name and organization from the draft (R-AUTH-11). After
  the usage step the applicant waits; approval still emails a working link
  (R-AUTH-10), and rejection erases them (R-AUTH-3).
- **The door no longer tells known and unknown addresses apart**: both get the
  same screen. A rejected address is still told so (R-AUTH-13).

## Alternatives considered

- **Onboard the applicant fully at the door, before any link** — consent and
  the acceptance of the terms would be recorded for an address nobody has
  confirmed.
- **Keep the draft in the browser** — the link often opens in another browser,
  such as a mail app's, so the draft would be lost when it is needed.
- **Accept the terms by typing in the form** ("by entering data you agree") —
  a deliberate click is what makes the terms an agreement; the privacy notice
  needs no agreement, only to be shown where the data is collected.
- **Always start at the profile step** — costs a step for everyone who filled
  the form while waiting; the profile preview gives the same safety.
- **Reuse the applicant handle** — an HMAC of the address that never expires
  and cannot be revoked; fine for two labels, too loose for a profile.

## Consequences

- One path through the door for everyone, and the waiting time for the email
  is used. The access-requested screen's form, `requested_name`,
  `requested_org` and the applicant handle go; the access-requested screen
  becomes the applicant's waiting screen after onboarding.
- **Profile data is stored before the address is confirmed**, as a draft, on
  the basis of steps taken at the person's request, with the notice shown at
  collection. Whoever types an address can write its draft; the profile
  preview is what keeps that from reaching a profile unseen. Reverses
  R-ONB-7 and the part of ADR 0041 that keeps the profile in the browser.
- An applicant now has a session. The access model gains a state between
  signed out and onboarded: signed in, not admitted. R-AUTH-1 changes from
  "no session" to "no access to the app".
- Applicants receive a sign-in email at the door, so the sign-in email
  allowances and the human check (R-NFR-8) now cover them too.
- The door stops revealing whether an address is on the whitelist. Amends
  ADR 0013: applicants still learn their status, after signing in.
- Drafts are new personal data to purge; the retention is a config value.
- Amends ADR 0041: the profile is saved field by field as a draft instead of
  held in the tab, and the privacy step shows it.

## References

Amends ADR 0013, ADR 0041. Follows ADR 0027, ADR 0040. Requirements:
R-AUTH-1..4, R-AUTH-9..12, R-INV-5, R-ONB-1, R-ONB-6..8, R-ONB-14, R-ONB-15,
R-NFR-8. Spec: `specs/flows.md` F1, F2, F4, F15; `specs/design.md` §2, §3,
§4, §7.
