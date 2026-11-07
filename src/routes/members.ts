import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import type { LiveSettings } from '../config.js'
import type { MemberSearchService } from '../services/member-search.js'
import { requirePermission, type GuardedLocals } from './require-permission.js'

// While hosts have search off, its addresses are as absent as ones that
// never existed (R-FIND-1, R-NAV-8).
function whileSearchOn(settings: Pick<LiveSettings, 'limits'>): RequestHandler {
  return (_request, response, next) => {
    if (settings.limits().memberSearch === 1) {
      next()
      return
    }
    response.status(404).json({ error: 'not_found' })
  }
}

const searchQuery = z.object({ q: z.string().max(500).default('') })

/** `/api/members/search` and `/api/members/:id/card` (design §3): a few
 * member cards for a query, and one card reach allows, behind the hosts'
 * switch and `member:search`. The query is never logged (R-FIND-1,3,6,8). */
export function memberRoutes(deps: {
  auth: AuthProvider
  settings: Pick<LiveSettings, 'limits'>
  memberSearch: MemberSearchService
}): Router {
  const router = Router()
  const guards = [
    whileSearchOn(deps.settings),
    requirePermission(deps.auth, 'member:search'),
  ]

  router.get('/api/members/search', ...guards, async (request, response) => {
    const { member } = response.locals as GuardedLocals
    const { q } = searchQuery.parse(request.query)
    response.json(await deps.memberSearch.search(member.id, q))
  })

  router.get('/api/members/:id/card', ...guards, async (request, response) => {
    const { member } = response.locals as GuardedLocals
    const card = await deps.memberSearch.card(
      member.id,
      String(request.params['id']),
    )
    if (card === null) response.status(404).json({ error: 'not_found' })
    else response.json({ card })
  })

  return router
}
