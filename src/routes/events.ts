import { Router } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import {
  experimentKeys,
  experiments,
  type ExperimentKey,
} from '../experiments.js'
import { routeTable } from '../routes.js'
import type { AnalyticsEvent, Track } from '../services/analytics.js'
import { notificationKinds } from '../services/notifications.js'
import { requireSession, type GuardedLocals } from './require-permission.js'

const screens: readonly string[] = [
  ...routeTable.map((route) => route.name),
  'not-found',
]
const screenName = z.string().refine((name) => screens.includes(name))

// A variant counts only beside its own experiment.
const exposure = z
  .object({
    experiment: z.enum(experimentKeys as [ExperimentKey, ...ExperimentKey[]]),
    variant: z.string(),
  })
  .strict()
  .refine(({ experiment, variant }) =>
    (experiments[experiment] as readonly string[]).includes(variant),
  )

/** The UI events of design §7, with their listed properties only. A screen
 * is a route name, never a path, so no id rides along. */
const uiEvent: z.ZodType<AnalyticsEvent> = z
  .discriminatedUnion('event', [
    z.object({
      event: z.literal('journey_chosen'),
      props: z.object({ journey: z.enum(['ask', 'offer']) }).strict(),
    }),
    z.object({
      event: z.literal('feedback_opened'),
      props: z.object({ screen: screenName }).strict(),
    }),
    z.object({
      event: z.literal('game_opened'),
      props: z.object({}).strict(),
    }),
    z.object({
      event: z.literal('recap_opened'),
      props: z.object({}).strict(),
    }),
    z.object({
      event: z.literal('recap_shared'),
      props: z
        .object({ via: z.enum(['share_sheet', 'linkedin', 'image']) })
        .strict(),
    }),
    z.object({ event: z.literal('experiment_exposed'), props: exposure }),
    z.object({
      event: z.literal('matches_section_opened'),
      props: z
        .object({ section: z.enum(['same_boat', 'been_there', 'cases']) })
        .strict(),
    }),
    z.object({
      event: z.literal('match_connect_tapped'),
      props: z.object({ kind: z.enum(['same_boat', 'been_there']) }).strict(),
    }),
    z.object({
      event: z.literal('contact_reached_out'),
      props: z.object({ method: z.enum(['email', 'copy']) }).strict(),
    }),
    z.object({
      event: z.literal('notifications_list_opened'),
      props: z.object({ new_count: z.number().int().nonnegative() }).strict(),
    }),
    z.object({
      event: z.literal('notification_opened'),
      props: z
        .object({
          type: z.enum(notificationKinds),
          via: z.enum(['app', 'email']),
        })
        .strict(),
    }),
    z.object({
      event: z.literal('screen_viewed'),
      props: z.object({ screen: screenName }).strict(),
    }),
  ])
  .transform(
    ({ event, props }) => ({ name: event, ...props }) as AnalyticsEvent,
  )

/** `POST /api/events` (design §3): UI events relayed to analytics from the
 * server, so no analytics script runs in the browser (ADR 0026). It answers
 * 204 whether or not the member is opted in. */
export function eventRoutes(deps: {
  auth: AuthProvider
  track: Track
}): Router {
  const router = Router()

  router.post('/api/events', requireSession(deps.auth), (request, response) => {
    const event = uiEvent.safeParse(request.body)
    if (!event.success) {
      response.status(400).json({ error: 'bad_request' })
      return
    }
    const member = (response.locals as GuardedLocals).member
    void deps.track(member.id, event.data)
    response.status(204).end()
  })

  return router
}
