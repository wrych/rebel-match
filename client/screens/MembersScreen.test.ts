// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MembersScreen from './MembersScreen.vue'

const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))
const permissions = vi.fn<() => string[]>()
vi.mock('../lib/session', () => ({
  loadMe: () => Promise.resolve({ permissions: permissions() }),
}))

const mia = {
  id: 'm-mia',
  email: 'mia@example.invalid',
  name: 'Mia Rebel',
  jobTitle: 'Coach',
  org: 'Buurtzorg',
  sector: 'Health',
  companySize: null,
  status: 'active',
  roles: ['admin', 'member'],
  joinedAt: '2026-10-01T09:00:00.000Z',
}
const ben = {
  id: 'm-ben',
  email: 'ben@example.invalid',
  name: null,
  jobTitle: null,
  org: null,
  sector: null,
  companySize: null,
  status: 'applicant',
  roles: [],
  joinedAt: '2026-10-02T09:00:00.000Z',
}

const HOLD_MS = 400

type Reply = { status: number; body?: unknown }

const GRACE = { eraseAfter: '2026-11-04T10:00:00.000Z' }

/** Serves the roster and answers each change by method, recording it. */
function server(
  replies: Partial<Record<'POST' | 'DELETE', Reply>> = {},
  ok = true,
): { calls: string[] } {
  const calls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: { method?: string }) => {
      const method = init?.method ?? 'GET'
      if (method !== 'GET') calls.push(`${method} ${url}`)
      const reply =
        url === '/api/config'
          ? {
              status: 200,
              body: {
                limits: { holdToSelectMs: HOLD_MS, erasureGraceDays: 30 },
              },
            }
          : method === 'GET'
            ? { status: ok ? 200 : 500, body: { members: [ben, mia] } }
            : (replies[method as 'POST' | 'DELETE'] ?? { status: 204 })
      return Promise.resolve({
        ok: reply.status < 300,
        status: reply.status,
        json: async () => reply.body,
      })
    }),
  )
  return { calls }
}

async function shown(): Promise<ReturnType<typeof mount>> {
  const screen = mount(MembersScreen)
  await flushPromises()
  return screen
}

function cards(
  screen: ReturnType<typeof mount>,
): ReturnType<ReturnType<typeof mount>['findAll']> {
  return screen.findAll('li.member')
}

async function selectAll(screen: ReturnType<typeof mount>): Promise<void> {
  for (const selector of screen.findAll('.selector'))
    await selector.trigger('click')
}

beforeEach(() => {
  permissions.mockReturnValue(['member:delete', 'role:grant'])
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  push.mockReset()
  permissions.mockReset()
})

describe('MembersScreen (R-MEM-1)', () => {
  it('shows each member with the lines the app shows a person by', async () => {
    server()
    const screen = await shown()

    const card = cards(screen)[1]
    expect(card?.find('.card-title').text()).toBe('Mia Rebel')
    expect(card?.find('.line').text()).toBe('Coach · Buurtzorg · Health')
    expect(card?.text()).toContain('mia@example.invalid')
    expect(card?.text()).toContain('admin')
    expect(card?.text()).toContain('active')
  })

  it('names someone without a name by their email', async () => {
    server()
    const screen = await shown()

    expect(cards(screen)[0]?.find('.card-title').text()).toBe(
      'ben@example.invalid',
    )
  })

  it("opens a member's page from their card (R-MEM-2)", async () => {
    server()
    const screen = await shown()

    await cards(screen)[1]?.find('a').trigger('click')

    expect(push).toHaveBeenCalledWith('/admin/members/m-mia')
  })

  it('narrows the list by search', async () => {
    server()
    const screen = await shown()

    await screen.find('#member-search').setValue('mia')

    expect(cards(screen)).toHaveLength(1)
  })

  it('says so when the members cannot be loaded', async () => {
    server({}, false)
    const screen = await shown()

    expect(screen.find('[role="alert"]').text()).toContain('could not')
  })
})

describe('MembersScreen, selecting several (R-MEM-3)', () => {
  it("starts selecting from a card's selector, outlining the card", async () => {
    server()
    const screen = await shown()

    await cards(screen)[0]?.find('.selector').trigger('click')

    expect(cards(screen)[0]?.classes()).toContain('selected')
    expect(cards(screen)[0]?.find('.selector').attributes('aria-checked')).toBe(
      'true',
    )
    expect(screen.find('.action-bar').text()).toContain('1 selected')
  })

  it('starts selecting when a card is held', async () => {
    vi.useFakeTimers()
    server()
    const screen = await shown()

    await cards(screen)[1]?.find('a').trigger('pointerdown')
    vi.advanceTimersByTime(HOLD_MS)
    await screen.vm.$nextTick()
    await cards(screen)[1]?.find('a').trigger('pointerup')
    await cards(screen)[1]?.find('a').trigger('pointerleave')
    // A pointer's click carries a click count; a keyboard's does not.
    cards(screen)[1]
      ?.find('a')
      .element.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }),
      )
    await screen.vm.$nextTick()

    expect(cards(screen)[1]?.classes()).toContain('selected')
    expect(push).not.toHaveBeenCalled()
  })

  it('chooses cards with a tap while selecting, instead of opening them', async () => {
    server()
    const screen = await shown()
    await cards(screen)[0]?.find('.selector').trigger('click')

    await cards(screen)[1]?.find('a').trigger('click')

    expect(push).not.toHaveBeenCalled()
    expect(screen.find('.action-bar').text()).toContain('2 selected')
  })

  it('gives a role to those without it, reporting each', async () => {
    const { calls } = server()
    const screen = await shown()
    await selectAll(screen)
    await screen.find('#bulk-role').setValue('admin')

    await screen.find('button.btn-primary').trigger('click')
    await flushPromises()

    expect(calls).toEqual(['POST /api/admin/members/m-ben/roles'])
    const text = screen.find('[role="status"]').text()
    expect(text).toContain('Gave admin to ben@example.invalid.')
    expect(text).toContain('Mia Rebel: already had admin.')
    expect(screen.find('.action-bar').exists()).toBe(false)
  })

  it('takes a role away, and one refusal does not stop the rest', async () => {
    server({ DELETE: { status: 409, body: { result: 'last_holder' } } })
    const screen = await shown()
    await selectAll(screen)
    await screen.find('#bulk-role').setValue('admin')

    await screen
      .findAll('.action-bar button')
      .find((b) => b.text() === 'Take away')
      ?.trigger('click')
    await flushPromises()

    const text = screen.find('[role="status"]').text()
    expect(text).toContain('Mia Rebel: nobody else could give roles')
    expect(text).toContain('ben@example.invalid: did not have admin.')
  })

  it('deletes everyone selected after one confirmation that counts them', async () => {
    const { calls } = server({ DELETE: { status: 200, body: GRACE } })
    const screen = await shown()
    await selectAll(screen)

    await screen
      .findAll('.action-bar button')
      .find((b) => b.text() === 'Delete…')
      ?.trigger('click')
    expect(screen.find('[role="alert"]').text()).toContain(
      'Delete 2 members? They are hidden from everyone at once and erased with everything they wrote after 30 days',
    )
    expect(calls).toEqual([])

    await screen.find('.action-bar button.btn-dark').trigger('click')
    await flushPromises()

    expect(calls).toEqual([
      'DELETE /api/admin/members/m-ben',
      'DELETE /api/admin/members/m-mia',
    ])
    const text = screen.find('[role="status"]').text()
    expect(text).toContain('Deleted, hidden from everyone')
    expect(text).toContain('4 November 2026')
  })

  it('puts the actions above the list, where they stay in reach', async () => {
    server()
    const screen = await shown()
    await cards(screen)[0]?.find('.selector').trigger('click')

    const bars = screen.findAll('.action-bar')
    expect(bars).toHaveLength(1)
    expect(bars[0]?.element.nextElementSibling?.tagName).toBe('UL')
  })

  it('offers no role actions to a host who cannot grant roles', async () => {
    permissions.mockReturnValue(['member:delete'])
    server()
    const screen = await shown()

    await cards(screen)[0]?.find('.selector').trigger('click')

    expect(screen.find('#bulk-role').exists()).toBe(false)
    expect(screen.find('.action-bar').text()).toContain('Delete…')
  })

  it('stops selecting with Done', async () => {
    server()
    const screen = await shown()
    await cards(screen)[0]?.find('.selector').trigger('click')

    await screen
      .findAll('.action-bar button')
      .find((b) => b.text() === 'Done')
      ?.trigger('click')

    expect(screen.find('.action-bar').exists()).toBe(false)
    expect(cards(screen)[0]?.classes()).not.toContain('selected')
  })

  it('reports the outcomes even when the list cannot be refreshed', async () => {
    server()
    const screen = await shown()
    await selectAll(screen)
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: { method?: string }) =>
        Promise.resolve(
          init?.method === 'DELETE'
            ? { ok: true, status: 200, json: async () => GRACE }
            : _url === '/api/config'
              ? {
                  ok: true,
                  status: 200,
                  json: async () => ({
                    limits: { holdToSelectMs: HOLD_MS, erasureGraceDays: 30 },
                  }),
                }
              : { ok: false, status: 500, json: async () => ({}) },
        ),
      ),
    )

    await screen
      .findAll('.action-bar button')
      .find((b) => b.text() === 'Delete…')
      ?.trigger('click')
    await screen.find('.action-bar button.btn-dark').trigger('click')
    await flushPromises()

    const text = screen.find('[role="status"]').text()
    expect(text).toContain('Deleted')
    expect(text).toContain('could not be refreshed')
  })

  it('acts only on selected members still in view', async () => {
    const { calls } = server({ DELETE: { status: 200, body: GRACE } })
    const screen = await shown()
    await selectAll(screen)
    await screen.find('#member-search').setValue('mia')

    expect(screen.find('.action-bar').text()).toContain('1 selected')
    await screen
      .findAll('.action-bar button')
      .find((b) => b.text() === 'Delete…')
      ?.trigger('click')
    await screen.find('.action-bar button.btn-dark').trigger('click')
    await flushPromises()

    expect(calls).toEqual(['DELETE /api/admin/members/m-mia'])
  })

  it('offers no delete to a host who may not delete', async () => {
    permissions.mockReturnValue(['role:grant'])
    server()
    const screen = await shown()

    await cards(screen)[0]?.find('.selector').trigger('click')

    expect(screen.find('.action-bar').text()).not.toContain('Delete')
    expect(screen.find('#bulk-role').exists()).toBe(true)
  })
})
