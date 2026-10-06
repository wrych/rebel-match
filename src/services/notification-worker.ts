import type { NotificationWorkerSettings } from '../config.js'
import type { DeliveryStatus } from './mailer.js'

/** A notification waiting to be mailed, with what deciding about it needs. */
export interface DueNotification {
  id: string
  type: 'connection_request' | 'new_connection' | 'applicant'
  recipientId: string
  aboutMemberId: string
  connectionId: string | null
  createdAt: Date
  attempts: number
  seen: boolean
  hidden: boolean
  recipientActive: boolean
  aboutDeleted: boolean
  /** A request's status, null for an applicant. */
  requestStatus: 'pending' | 'accepted' | 'declined' | null
  /** An applicant's status and address, null for a request. */
  applicantStatus: string | null
  applicantEmail: string | null
}

export type SkipReason = 'seen' | 'stale' | 'off'

export interface NotificationMailStore {
  /** Waiting notifications due by `now`, oldest first, at most `limit`;
   * each is held until `holdUntil`, so another server passes it by. */
  claimDue(
    now: Date,
    limit: number,
    holdUntil: Date,
  ): Promise<DueNotification[]>
  mailed(id: string, cadence: string, at: Date): Promise<void>
  skipped(id: string, reason: SkipReason): Promise<void>
  retryAt(id: string, attempts: number, at: Date): Promise<void>
  failed(id: string, attempts: number): Promise<void>
}

/** Sends one notification's mail; null when there was nobody to send it to. */
export type SendNotification = (
  note: DueNotification,
) => Promise<DeliveryStatus | null>

// Every type is mailed at once until members choose otherwise (ADR 0037).
const IMMEDIATELY = 'immediately'
const MS_PER_SECOND = 1000

/** Why not to mail it, or null to mail it (R-NOTE-9). */
export function skipReason(note: DueNotification): SkipReason | null {
  if (note.hidden) return 'off'
  if (note.seen) return 'seen'
  if (!note.recipientActive || note.aboutDeleted) return 'stale'
  if (note.type === 'connection_request' && note.requestStatus !== 'pending')
    return 'stale'
  if (note.type === 'applicant' && note.applicantStatus !== 'applicant')
    return 'stale'
  return null
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

// A send that throws, a lost connection say, counts as refused, so its
// attempts are counted and capped like any other (R-NOTE-10).
async function attempt(
  deps: WorkerDeps,
  note: DueNotification,
): Promise<DeliveryStatus | null> {
  try {
    return await deps.send(note)
  } catch (error) {
    deps.onError(error)
    return 'failed'
  }
}

async function deliver(
  deps: WorkerDeps,
  note: DueNotification,
  now: Date,
): Promise<void> {
  const skip = skipReason(note)
  if (skip !== null) return deps.store.skipped(note.id, skip)
  const status = await attempt(deps, note)
  if (status === null) return deps.store.skipped(note.id, 'stale')
  if (status !== 'failed') return deps.store.mailed(note.id, IMMEDIATELY, now)
  const attempts = note.attempts + 1
  const next = retryAfter(attempts, deps.settings(), now)
  return next === null
    ? deps.store.failed(note.id, attempts)
    : deps.store.retryAt(note.id, attempts, next)
}

interface WorkerDeps {
  store: NotificationMailStore
  send: SendNotification
  settings: () => NotificationWorkerSettings
  now?: () => Date
  onError: (error: unknown) => void
}

/** Mails what is due, each notification on its own (R-NOTE-7..10, ADR 0037):
 * what was seen or no longer applies is left out, a refused mail is tried
 * again later, and a claimed notification is mailed by one server only. One
 * that fails to send is reported and retried after its hold. */
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
      for (const note of due) await deliver(deps, note, at).catch(deps.onError)
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
