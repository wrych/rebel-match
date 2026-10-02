export type OutboxStatus = 'recorded' | 'sent' | 'suppressed' | 'failed'

/** One entry of the outbound message log, as `GET /api/admin/outbox` sends it. */
export interface OutboxEntry {
  id: string
  to: string
  kind: string
  subject: string
  bodyText: string
  status: OutboxStatus
  error: string | null
  createdAt: string
  sentAt: string | null
}

export interface OutboxQuery {
  to?: string
  status?: OutboxStatus | ''
}

/** Reads the log, newest first, filtered by recipient and status (R-MSG-5). */
export async function fetchOutbox(query: OutboxQuery): Promise<OutboxEntry[]> {
  const params = new URLSearchParams()
  if (query.to !== undefined && query.to.trim() !== '')
    params.set('to', query.to.trim())
  if (query.status !== undefined && query.status !== '')
    params.set('status', query.status)

  const suffix = params.size > 0 ? `?${params.toString()}` : ''
  const response = await fetch(`/api/admin/outbox${suffix}`)
  if (!response.ok)
    throw new Error(`outbox unavailable (${String(response.status)})`)
  return ((await response.json()) as { entries: OutboxEntry[] }).entries
}

export type BodyPart = { text: string } | { href: string }

const URL_PATTERN = /https?:\/\/\S+/g

/** A stored body split into text and links, where only links to this app are
 * links: in development that makes sign-in links clickable (F14) without the
 * log ever rendering a link to somewhere else. */
export function bodyParts(body: string, origin: string): BodyPart[] {
  const parts: BodyPart[] = []
  let last = 0
  for (const match of body.matchAll(URL_PATTERN)) {
    const url = match[0]
    if (!url.startsWith(`${origin}/`)) continue
    if (match.index > last) parts.push({ text: body.slice(last, match.index) })
    parts.push({ href: url })
    last = match.index + url.length
  }
  if (last < body.length) parts.push({ text: body.slice(last) })
  return parts
}
