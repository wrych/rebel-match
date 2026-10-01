# Rebel Match — Prioritized Feature List

Prioritization uses **MoSCoW** (Must / Should / Could / Won't) against the beta
deadline: feature-complete and pilot-tested by **2026-11-01**, summit launch
**2026-11-08**.

Guiding rule from the meeting: **focus on sharing challenges and sharing
experience; cut the gamification.** Build the pipeline in the order challenges →
matching → connecting, because each step is independently useful. *(Andy: "we can
start with just adding the challenges as the first priority, then adding that
step in between is relatively easy… step by step so we certainly have something
that works.")*

---

## Must have (no beta without these)

| # | Feature | Why it's a Must |
|---|---------|-----------------|
| M1 | Magic-link email login over a whitelist | The only way in; privacy depends on a closed membership. |
| M2 | First-time onboarding: name + data-usage consent | Legal/privacy gate; names populate every match card. |
| M3 | Submit a challenge (free text) | The core input; everything downstream needs it. |
| M4 | Trend auto-match to 1 of 8 trends, with manual override | Organizes matching; "works nice… good enough for the beta." |
| M5 | Matches for a challenge: same boat + been there + case studies | The payoff of asking for help. |
| M6 | Offer-help swipe deck (same boat / been there / skip / follow) | The second journey; the "Tinder feel" that makes it usable in a break. |
| M7 | **Double opt-in connect** (ask first, then exchange emails) | Privacy-critical; "needed, not optional." |
| M8 | Matches cockpit: incoming requests + Accept/Decline | Where opt-in is granted; the personal overview. |
| M9 | Mobile-first UI | Launch mechanic is a phone + QR code at the summit. |
| M10 | Seed content (8 trends + case studies, some seed challenges) | App must be non-empty and demoable on day one. |

## Should have (strongly wanted; cut only under deadline pressure)

| # | Feature | Notes |
|---|---------|-------|
| S1 | Admin approval of new applicants + whitelist management | Can start as a seeded whitelist + manual DB/CLI; UI can follow. |
| S2 | Follow a trend / "follow this topic" | Low effort; drives return visits. |
| S3 | Usage analytics (PostHog, free tier) | See how the summit crowd uses it; privacy-scoped (no PII). |
| S4 | Email notification on an incoming connection request | At the summit everyone is in the room, so in-app may suffice — but valuable right after. |
| S5 | Feedback affordance (mailto) | Cheap; useful signal during the pilot. |
| S6 | Use the ~15 real collected challenges as seed | Makes the summit demo authentic. |

## Could have (nice, only if time remains)

| # | Feature | Notes |
|---|---------|-------|
| C1 | Example-challenge inserts on the submit screen | Helps members phrase a good challenge. |
| C2 | Richer admin dashboard (metrics, moderation) | Beyond a plain approvals list. |
| C3 | "Peers working on this trend" counts shown live | Prototype shows static counts; live counts are a polish item. |
| C4 | GDPR self-service deletion (vs. admin-only) | Admin-triggered deletion covers the Must; self-service is extra. |
| C5 | LLM-based trend classification (replacing keywords) | "AI will be pretty good at matching" — a clean post-beta upgrade. |

## Won't have (this beta)

| # | Feature | Reason |
|---|---------|--------|
| W1 | Gamification: standings, badges, ranks, milestone pop-ups | Explicitly cut for beta. |
| W2 | Corporate↔rebel theme toggle ("CR" / happy mode) | Prototype fun; no product value for beta. |
| W3 | "Nominate as frontier" escalation | Idea stage; no defined flow. |
| W4 | Integration with the Corporate Rebels member platform | "Significant work… avoid if possible." |
| W5 | Connect via phone number or LinkedIn | Email only for beta. |
| W6 | LLM-based case-study matching | Beta uses curated per-trend case lists. |

---

## Build order (dependency-first)

1. **Foundation** — Node+MySQL skeleton, schema, config, seed trends/cases.
2. **Auth & onboarding** (M1, M2) — nothing else is reachable without it.
3. **Ask journey** (M3 → M4 → M5) — challenges, then matching, then match view.
4. **Offer journey** (M6) — swipe deck over existing challenges.
5. **Connecting** (M7 → M8) — the privacy-critical double opt-in + cockpit.
6. **Supporting** (S1–S6) — admin approvals, analytics, follow, notifications.
7. **Hardening & pilot** — mobile polish, seed real challenges, test with a few
   people before 2026-11-01.
