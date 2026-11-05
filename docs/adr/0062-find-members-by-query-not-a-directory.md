# 0062. Find members by a capped query, never a directory

- **Status:** Accepted
- **Date:** 2026-11-05
- **Deciders:** Andy Moesch

## Context

Members meet at the summit, or know of someone by name, and want to connect
without a challenge to bring them together. Until now the only way to reach
another member was through a match or the deck. R-CONN-6 says the system
shall not expose a member directory or bulk contact export: the app holds
people's unsolved problems, and a list of everyone in it, with where they
work, is something a scraper or a recruiter would want.

Members already agree, at onboarding, that their name, organization and
profile may be seen by other members wherever the app shows them (R-ONB-5).
LinkedIn lets its members search people by company or title without a name,
and keeps that from becoming a bulk export by capping what one query shows.

## Decision

Members find each other with a **query**, never a list. One pure parser reads
a Gmail-style query: plain words for the name, and `name:`, `company:`,
`title:`, `sector:` to narrow it, prefix matches, quotes for phrases, every
term ANDed. A name is not required. The answer is at most
`limits.memberSearchMaxResults` cards, with "more match" but never how many,
and never an email.

Members are **findable unless they turn it off** on the profile screen. The
search sits behind `limits.memberSearch`, a switch hosts hold, and the
`member:search` permission every member has, so it can be closed in a minute
and given to fewer people later without touching a guard.

A connection made from search is a new kind, **direct**, about no challenge,
and goes through the double opt-in unchanged (ADR 0004). A direct request is
allowed only to a member the requester can reach, and capped per day.

## Alternatives considered

- **No search** — keeps R-CONN-6 at its most literal, and leaves members who
  met in the hallway without a way in.
- **Require a name in every query** — stops `company:acme` from listing a
  company, and takes away the most useful query at a summit ("who else from
  Acme is here?"). The cap does the same job with less loss.
- **Opt-in to be findable** — the safer default, and search would find almost
  nobody. Members already agreed their profile is seen by other members.
- **Search email addresses** — would confirm whether an address is a member,
  the enumeration ADR 0013 trades against. Never.
- **Free-text over everything, with OR and negation** — a bigger parser and
  broader answers, for queries nobody at a summit needs.

## Consequences

- R-CONN-6 now reads as "no directory, no bulk export": a capped query
  answer is allowed. A reviewer should reject anything that lists members
  without a query, raises the cap without a host deciding, or returns a
  count.
- `connection_requests.kind` gains `direct`; the badges count it under
  Connect, not Shared pain.
- Members who never open the profile screen are findable. The consent words
  and the privacy notice already say other members may see a member's
  profile, so neither changes (requirements §11, 9, resolved).
- The query is a name, so it is never logged nor sent to analytics; only
  which operators were used and whether anything came back.
- A determined member can still walk the alphabet two letters at a time; the
  cap, the rate limits (ADR 0029) and the switch bound it, they do not stop
  it.

## References

Requirements: R-FIND-1..8, R-CONN-1, R-CONN-6, R-ONB-5. ADR 0004, ADR 0029.
Spec: `specs/flows.md` F25; `specs/design.md` §1, §2, §3, §4.
