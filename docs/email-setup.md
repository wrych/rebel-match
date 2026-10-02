# Email setup runbook

Magic links are the only way into this app (ADR 0003), so deliverability is not an
operational detail — it is the product's front door. R-NFR-3 gives the whole
journey under two minutes, and ~30 seconds of that is the link reaching a phone
inbox.

This closes requirements §11 open question 4 once the from-address and DNS are
settled.

## Do this first, before anything else

**Buy the domain now, even if the name is not final.** Inbox placement depends on
domain _age_ and _sending history_, and those are the only inputs that cannot be
acquired later. A domain registered a week before the summit, sending 350 magic
links in a ten-minute burst to corporate mailboxes, looks exactly like a spam run.
The same domain registered five weeks earlier, trickling mail the whole time,
looks like a service.

Then **start sending low volume immediately** — the pilot group (M6), the team,
anything real. The trickle is the point.

## What we are working with

The team owns the hosting and runs its own SMTP server (ADR 0008), which changes
two things from the usual advice:

- **PTR is already ours and should not change.** Reverse DNS is per-IP, so there
  is only one, and if that server already sends mail it is presumably
  `mail.<existing-domain>` with a matching forward record. Leave it.
- **PTR and HELO do not need to match the new domain.** DMARC alignment comes from
  the `From:` domain matching DKIM's `d=`, not from reverse DNS. Adding a sending
  domain to a working MTA is a small job: a new DKIM selector, a TXT record, and
  telling the MTA to sign for it.

## The long-lead risk is the IP's reputation

This replaces reverse DNS as the thing that cannot be fixed quickly. Check it the
same day the domain is bought.

```sh
# PTR, and does it forward-confirm back to the same IP?
dig -x <sending-ip> +short
dig +short mail.<existing-domain>

# Spamhaus ZEN — any 127.0.0.x answer means listed (reverse the octets)
dig +short <reversed-ip>.zen.spamhaus.org

# Can the host even reach the outside world on 25?
nc -zv gmail-smtp-in.l.google.com 25
```

Also ask: **what else sends from that IP?** If the server carries newsletters or
another app, we share their reputation. Delisting is self-service on some lists
and takes days on others, so this is a week-one question, not a launch-week one.

## IPv6, before it bites

If the host has IPv6 and the MTA uses it, Gmail and others **reject** IPv6 mail
that lacks valid reverse DNS and authentication — and it fails confusingly,
because IPv4 to the same recipient works.

```sh
ip -6 addr
postconf -n | grep -E 'inet_protocols|myhostname'
```

Either set up IPv6 rDNS properly or pin outbound to IPv4
(`inet_protocols = ipv4` in Postfix). Pinning is the safer call on this timeline.

## The DNS records

```
; SPF — exactly ONE record at the apex. Two v=spf1 records is a permanent error.
example.com.            TXT   "v=spf1 ip4:<sending-ip> ~all"

; DKIM — the public half of a 2048-bit key generated on the SMTP server
<selector>._domainkey   TXT   "v=DKIM1; k=rsa; p=MIIBIjANBgkq..."

; DMARC — start permissive, tighten once alignment is confirmed
_dmarc                  TXT   "v=DMARC1; p=none; rua=mailto:dmarc@example.com; fo=1"

; MX — we must RECEIVE mail: DMARC reports, bounces, replies, R-FB-1 feedback
example.com.            MX    10 mail.example.com.
```

Set TTLs to 300s while iterating; raise them afterwards.

Two traps for this setup specifically:

- **If human mail is ever sent from this domain** (Google Workspace, M365), SPF
  needs both sources in the _one_ record and a second DKIM selector. Decide that
  before publishing `-all`.
- **Do not use a `noreply@` that rejects everything.** Bounces and replies landing
  nowhere hurts reputation, and the DMARC `rua` address must actually receive
  mail.

## Staged tightening

| When              | Action                                                                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Day 0             | Publish SPF (`~all`), DKIM, DMARC `p=none`, MX. Check the IP's reputation.                                                                                               |
| Day 0–1           | DKIM signing live; HELO set to the mail hostname; PTR forward-confirms.                                                                                                  |
| Day 1             | Verify: send to Gmail, Microsoft 365 and iCloud, read the raw headers. Want `spf=pass dkim=pass dmarc=pass` **and alignment** — the `From:` domain matching DKIM's `d=`. |
| Day 1–7           | Trickle real mail. Register the domain in Google Postmaster Tools and Microsoft SNDS, so reputation is observed rather than guessed.                                     |
| Week 2            | DMARC → `p=quarantine`, then `p=reject`. SPF → `-all`.                                                                                                                   |
| Before 2026-11-01 | The M6 pilot group receives genuine magic links on this domain.                                                                                                          |
| 2026-11-08        | No cold start.                                                                                                                                                           |

## The magic-link email itself

It is transactional, not a newsletter:

- multipart plain-text **and** HTML
- the link on the same domain as the `From:`
- **no link shorteners and no click-tracking redirects** — which also keeps us
  clean on R-ANA-3
- few links, a plain subject, the link as text rather than an image button
- **no `List-Unsubscribe`** — wrong for transactional mail, and it signals "bulk"

## Verifying

`mail-tester.com` for a 0–10 score with specifics, `learndmarc.com` to see
alignment visually, MXToolbox for PTR and blocklists. But the authoritative test
is the one R-NFR-3 needs anyway: **a real send to a real corporate inbox, timed,
with the spam folder checked** — not just the inbox.

The outbound message log (ADR 0016) is the other half of this. It separates "we
never sent it" from "the transport refused it" from "it went out and the inbox
swallowed it" — and only the third sends you back to these records.
