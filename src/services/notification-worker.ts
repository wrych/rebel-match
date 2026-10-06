import type { NotificationWorkerSettings } from '../config.js'
import type { DeliveryStatus } from './mailer.js'
import { dueAt, type Cadence } from './notification-cadence.js'

/** A notification waiting to be mailed, with what deciding about it needs. */
export interface DueNotification {
  id: string
  type:
    'connection_request' | 'new_connection' | 'trend_challenge' | 'applicant'
  recipientId: string
  aboutMemberId: string
  connectionId: string | null
  createdAt: Date
  attempts: number
  /** The recipient's choice for the type, or its default (R-NOTE-2). */
  cadence: Cadence
  seen: boolean
  hidden: boolean
  recipientActive: boolean
  aboutDeleted: boolean
  /** A request's status, null for an applicant. */
  requestStatus: 'pending' | 'accepted' | 'declined' | null
  /** An applicant's status and address, null for a request. */
  applicantStatus: string | null
  applicantEmail: string | null
  /** For a new challenge: the challenge, whether it is still shown, and the
   * short name of its trend. */
  challengeId: string | null
  challengeActive: boolean
  trend: string | null
}

export type SkipReason = 'seen' | 'stale' | 'in_app' | 'off'

export interface NotificationMailStore {
  /** Waiting notifications due by `now`, oldest first, at most `limit`;
   * each is held until `holdUntil`, so another server passes it by. */
  claimDue(
    now: Date,
    limit: number,
    holdUntil: Date,
  ): Promise<DueNotification[]>
  /** When the member's last mail of this cadence went out (R-NOTE-7). */
  lastMailed(recipientId: string, cadence: Cadence): Promise<Date | null>
  mailed(ids: readonly string[], cadence: Cadence, at: Date): Promise<void>
  skipped(id: string, reason: SkipReason): Promise<void>
  /** Leaves them waiting until `at`, when their cadence lets them go. */
  deferUntil(ids: readonly string[], at: Date): Promise<void>
  retryAt(ids: readonly string[], attempts: number, at: Date): Promise<void>
  failed(ids: readonly string[], attempts: number): Promise<void>
}

/** Sends one mail for these notifications, all to one member: one is its
 * type's own email, several a digest (R-NOTE-8). Null when nobody got one. */
export type SendNotifications = (
  notes: readonly DueNotification[],
) => Promise<DeliveryStatus | null>

const MS_PER_SECOND = 1000

// Whether what it is about still applies: a request still waiting, an
// applicant not yet decided, nobody it concerns gone (R-NOTE-9).
function stillApplies(note: DueNotification): boolean {
  if (!note.recipientActive || note.aboutDeleted) return false
  if (note.type === 'connection_request')
    return note.requestStatus === 'pending'
  if (note.type === 'trend_challenge') return note.challengeActive
  return note.type !== 'applicant' || note.applicantStatus === 'applicant'
}

/** Why not to mail it, or null to mail it (R-NOTE-3, R-NOTE-9). */
export function skipReason(note: DueNotification): SkipReason | null {
  if (note.hidden || note.cadence === 'off') return 'off'
  if (note.cadence === 'in_app') return 'in_app'
  if (note.seen) return 'seen'
  return stillApplies(note) ? null : 'stale'
}

/** When to try a refused mail again: after the first wait, then twice as
 * long each time; null when the attempts are spent (R-NOTE-10). */
export function retryAfter(
  attempts: number,
  settings: Pick<
    NotificationWorkerSettings,
    'maxAttempts' | 'firstRetrySeconds'
  >,
  now: Date,
): Date | null {
  if (attempts >= settings.maxAttempts) return null
  const wait = settings.firstRetrySeconds * MS_PER_SECOND * 2 ** (attempts - 1)
  return new Date(now.getTime() + wait)
}

interface WorkerDeps {
  store: NotificationMailStore
  send: SendNotifications
  settings: () => NotificationWorkerSettings
  now?: () => Date
  onError: (error: unknown) => void
}

// A send that throws, a lost connection say, counts as refused, so its
// attempts are counted and capped like any other (R-NOTE-10).
async function attempt(
  deps: WorkerDeps,
  notes: readonly DueNotification[],
): Promise<DeliveryStatus | null> {
  try {
    return await deps.send(notes)
  } catch (error) {
    deps.onError(error)
    return 'failed'
  }
}

async function mail(
  deps: WorkerDeps,
  notes: readonly DueNotification[],
  now: Date,
): Promise<void> {
  const [first] = notes
  if (first === undefined) return
  const ids = notes.map((note) => note.id)
  const status = await attempt(deps, notes)
  if (status === null) {
    for (const id of ids) await deps.store.skipped(id, 'stale')
    return
  }
  const { cadence } = first
  if (status !== 'failed') return deps.store.mailed(ids, cadence, now)
  const attempts = Math.max(...notes.map((note) => note.attempts)) + 1
  const next = retryAfter(attempts, deps.settings(), now)
  return next === null
    ? deps.store.failed(ids, attempts)
    : deps.store.retryAt(ids, attempts, next)
}

// One member's notifications on one cadence: mailed together once the
// cadence lets them go, each on its own when immediate (R-NOTE-7).
async function deliverGroup(
  deps: WorkerDeps,
  group: readonly DueNotification[],
  now: Date,
): Promise<void> {
  const [first] = group
  if (first === undefined) return
  const { recipientId, cadence } = first
  const oldest = new Date(
    Math.min(...group.map((note) => note.createdAt.getTime())),
  )
  const last = await deps.store.lastMailed(recipientId, cadence)
  const when = dueAt(cadence, last, oldest, now, deps.settings()) ?? now
  if (when > now)
    return deps.store.deferUntil(
      group.map((note) => note.id),
      when,
    )
  if (cadence !== 'immediately') return mail(deps, group, now)
  for (const note of group) await mail(deps, [note], now)
}

function byRecipientAndCadence(
  notes: readonly DueNotification[],
): DueNotification[][] {
  const groups = new Map<string, DueNotification[]>()
  for (const note of notes) {
    const key = `${note.recipientId} ${note.cadence}`
    groups.set(key, [...(groups.get(key) ?? []), note])
  }
  return [...groups.values()]
}

/** Mails what is due (R-NOTE-7..10, ADR 0037): what was seen, is kept in the
 * app or no longer applies is left out; the rest goes by each member's
 * cadence, every type on one cadence in one mail; a refused mail is tried
 * again later; a claimed notification is mailed by one server only. A
 * failure is reported and the run goes on. */
export function createNotificationWorker(deps: WorkerDeps): {
  deliverDue(): Promise<void>
} {
  const now = deps.now ?? ((): Date => new Date())
  return {
    deliverDue: async () => {
      const at = now()
      const { batch, holdSeconds } = deps.settings()
      const due = await deps.store.claimDue(
        at,
        batch,
        new Date(at.getTime() + holdSeconds * MS_PER_SECOND),
      )
      const live: DueNotification[] = []
      for (const note of due) {
        const skip = skipReason(note)
        if (skip === null) live.push(note)
        else await deps.store.skipped(note.id, skip).catch(deps.onError)
      }
      for (const group of byRecipientAndCadence(live))
        await deliverGroup(deps, group, at).catch(deps.onError)
    },
  }
}

/** Runs the worker now and then on every interval, one run at a time.
 * Returns a stop function. */
export function startNotificationWorker(deps: {
  worker: { deliverDue(): Promise<void> }
  intervalSeconds: number
  onError: (error: unknown) => void
  schedule?: (run: () => void, everyMs: number) => () => void
}): () => void {
  let running = false
  const run = (): void => {
    if (running) return
    running = true
    deps.worker
      .deliverDue()
      .catch(deps.onError)
      .finally(() => {
        running = false
      })
  }
  run()
  return (deps.schedule ?? everyInterval)(
    run,
    deps.intervalSeconds * MS_PER_SECOND,
  )
}

function everyInterval(run: () => void, everyMs: number): () => void {
  const timer = setInterval(run, everyMs)
  timer.unref()
  return () => {
    clearInterval(timer)
  }
}
