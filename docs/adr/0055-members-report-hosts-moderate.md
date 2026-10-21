# 0055. Members report, hosts moderate by hiding, and a ban is a status

- **Status:** Accepted
- **Date:** 2026-10-21
- **Deciders:** Andy Moesch

## Context

Once a challenge is posted, nobody can take it down. Its author cannot
withdraw it, and a host can remove it only by deleting the whole account. The
admin role has held `challenge:moderate` since ADR 0006, but no route checks
it. The only text one member sends another, the note with a connection
request, cannot be taken back or reported either.

At the summit several hundred people post and send notes within an hour.
Spam, or a note that crosses a line, will be seen by its target before any
host hears of it. The hosts are few, and they are busy running the event. So
they need to hear about a problem from the members who see it, see at a
glance who is reported and by how many people, and act in a tap or two.

Whatever moderation does, it must not weaken the privacy model. A reported
member does not learn who reported them. A host acts on what was reported,
and moderation gives no route around R-CONN-6.

## Decision

- **Authors withdraw their own challenges.** A withdrawn challenge stays with
  its author and is shown to nobody else. Pending requests about it close
  without a word, as a decline does (R-CONN-4). A withdrawal is not undone; the
  author posts again instead.
- **Members report; they never take anything down.** Any member can report
  another member's challenge, or the note on a connection request sent to
  them, as spam, inappropriate, or something else, with an optional comment.
  The report screen is a screen of its own, so it has a URL (ADR 0007). A
  report removes the item from the reporter's own view at once. Reporting a
  pending request also declines it. The reported member is never told who
  reported them, or that anyone did.
- **Reports are grouped by the member reported.** The moderation screen lists
  one card per reported member. Each card counts the open reports, the
  distinct people who made them, and the items they cover. Cards with more
  distinct reporters come first, so ten people reporting one spammer outweigh
  one person reporting ten times. A member's moderation page lists each
  reported item with its text and its reports. Every action is taken from
  there, and every action is recorded with who took it, when and why.
- **Hosts see who reported.** Each report on the moderation page names its
  reporter. Hosts already see every member's email (R-MEM-2), and a name is
  what tells a pile-on from a real pattern. The reported member never sees
  it.
- **Hosts hide; they do not delete.** Hiding a challenge or a note is a flag
  beside the content, not a change to its status. A host can therefore undo
  it, and it never collides with the author's own withdrawal. Hidden content
  is kept as evidence until the account is erased (R-NFR-7). Its author sees
  that a host hid it, and why.
- **A ban is a member status, `banned`.** A banned member's sessions end at
  once. The door tells them plainly that the account is suspended, sends no
  link and notifies nobody, as for a rejected address (R-AUTH-13). Nothing of
  theirs is shown to anyone, as with a deleted account (R-NFR-7). But nothing
  is erased, so the address cannot come back in through the door, an invite or
  the whitelist. A host can lift a ban. Lifting it shows again everything the
  ban hid, but nothing a host hid on its own, and it reopens no request the
  ban closed.
- **New permissions, held by `admin`.** `content:report` (every member),
  `report:review`, `member:ban`, and the existing `challenge:moderate`. A
  `moderator` role later is one row and one matrix column (R-ROLE-6).
- **Hosts hear of reports as a notification type**, _New report_, at a cadence
  they choose, hourly until they do (ADR 0037).

## Alternatives considered

- **Hide automatically after N reports** — it acts while the hosts are busy,
  but three friends can take down anyone's challenge. Not for the launch; it
  may come later, behind a setting that is off by default.
- **Hard-delete moderated content** — it leaves nothing to undo a mistake
  with, and nothing to show when the author asks why.
- **A ban as deletion** — the 30-day erasure frees the address, so a spammer
  rejoins a month later. The person can still ask to be erased; a host then
  deletes the account (F11).
- **A flat list of reports, newest first** — the aggregate is the point. A
  member reported by many people must stand out without the host counting.
- **Hide the reporter from hosts too** — it protects reporters a little more,
  but a host could no longer tell ten people from one person with a grudge
  who reports ten times.

## Consequences

- Every place that shows another member's challenge or note gains a quiet
  _Report_ action. The deck card is the only crowded one.
- "Shown" grows one more condition: active, not hidden, and the author active.
  Every query that lists challenges or notes has to use the same predicate.
  The trend newest list, the deck, peers, the cockpit and notifications all
  depend on it.
- Reports are personal data: who reported whom, with free text. They are
  erased with the reported member. When a reporter is erased, the report stays
  but loses its reporter. Handled reports go after
  `limits.reportRetentionDays`.
- A banned address stays in `members` with its profile. That holds personal
  data longer than a deletion would. The basis is preventing abuse, and the
  privacy notice needs a line saying so.
- More moderation could follow: muting a member for one person, or blocking
  between members. Neither is in this decision.

- Nothing about an address is kept once it is erased, a banned one included:
  a banned person who has themselves erased can ask to join again, and a host
  decides then (maintainer, 2026-10-21).

## References

Follows ADR 0006, ADR 0007, ADR 0032, ADR 0037. Requirements: R-ASK-17,
R-MOD-1..12, R-NOTE-1, R-NOTE-2, R-NFR-7, R-AUTH-13. Spec: `specs/flows.md`
F20, F21; `specs/design.md` §2, §3, §4.
