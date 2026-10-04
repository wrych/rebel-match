import { Router } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import { routeTable } from '../routes.js'
import type { AnalyticsEvent, Track } from '../services/analytics.js'
import { requireSession, type GuardedLocals } from './require-permission.js'

const screens: readonly string[] = [
  ...routeTable.map((route) => route.name),
  'not-found',
]

/** The two UI events of design §7, with their listed properties only. A
 * screen is a route name, never a path, so no id rides along. */
const uiEvent: z.ZodType<AnalyticsEvent> = z
  .discriminatedUnion('event', [
    z.object({
      event: z.literal('journey_chosen'),
      props: z.object({ journey: z.enum(['ask', 'offer']) }).strict(),
    }),
    z.object({
      event: z.literal('feedback_opened'),
      props: z
        .object({
          screen: z.string().refine((name) => screens.includes(name)),
        })
        .strict(),
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
