# 0050. Live lists poll, outline what arrives, and refresh on a pull

- **Status:** Accepted
- **Date:** 2026-10-11
- **Deciders:** Andy Moesch

## Context

Only the Matches screen refreshed on its own (R-MINE-4). Every other list —
the notifications, a challenge's matches, the host tools' outbound log,
members, applicants and invites — showed what it read when it opened. A host
waiting in the outbound log for a sign-in link to hand on reloaded the page
until it came, and nothing told them which entry was the one that arrived.

Each screen had grown its own way to load, and only two marked anything new,
both from what the server records as seen (R-MINE-6, R-NOTE-5).

## Decision

- **One live list, many screens.** `useLiveList` (`client/lib/live-list.ts`)
  runs a screen's refresh on the existing visible-page `poll`, never two at
  once, with the interval read from its own `limits.*PollSeconds`. The same
  refresh answers a pull down (`PullToRefresh`) and, on host-tool lists, a
  button (`RefreshButton`). Each screen keeps its own loading and layout;
  only the refreshing is shared.
- **Polling, not a push channel.** The server already answers these reads,
  and 8 or 60 seconds is fresh enough for every list here.
- **What is new lives in the open screen.** `arrivals` remembers the ids of
  the first load and outlines any id a later refresh brings until it is
  tapped. It is not stored: leaving forgets it (R-NAV-12). Where a rule
  already records seen on the server (R-MINE-6, R-NOTE-5), that rule wins.
- **Pull to refresh is ours and touch-only.** About sixty lines of touch
  events, so no dependency. Without a touch screen it is not offered, since a
  trackpad's two-finger scroll and swipe-back would collide with it. While a
  live list is mounted the page sets `overscroll-behavior-y: contain`, so
  Chrome on Android does not reload the page under our own refresh.
- **Each interval is a setting hosts may change** (R-CFG-6, amending ADR 0031's
  list), bounded to 2–3600 seconds, so a crowded room can be slowed without a
  deploy. A changed interval applies when a screen next opens.

## Alternatives considered

- **Server-sent events or WebSockets** — instant, but a new long-lived
  connection on Cloud Run, billed for as long as it is open, for lists that
  tolerate seconds of delay.
- **One `LiveList` component that draws the rows** — the lists share no row
  shape (cards, links, forms with actions); a component wrapping them all
  would need a slot for every part of every row.
- **A pull-to-refresh library** — the ones that exist bring their own styling
  and mouse support, which is what we leave out.
- **Storing what was seen per list** — a table and an endpoint for every list,
  to remember something the request said need not be remembered.

## Consequences

- A member on an open live list sends one read every 8 seconds; a host on a
  host-tool list one a minute, plus the outbound log's every 8 seconds. On the
  summit's few hundred phones that is well within one instance, and the
  intervals can be raised from the settings screen if it is not.
- A refresh replaces the list; a screen that holds a selection or an open
  form keys it by id, so it survives the refresh.
- The notifications screen marks what a refresh brings as seen, since it is
  listed (R-NOTE-5); a member watching it gets no mail for it (R-NOTE-9).

## References

Requirements: `R-NAV-12`, `R-MINE-4`, `R-MSG-5`, `R-NOTE-5`, `R-CFG-6`.
ADRs: 0031 (settings hosts change), 0049 (billed per request).
