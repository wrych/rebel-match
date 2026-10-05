// @vitest-environment jsdom
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MemberScreen from './MemberScreen.vue'

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'm-mia' } }),
}))
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
  sector: null,
  companySize: null,
  status: 'active',
  roles: ['member'],
  joinedAt: '2026-10-01T09:00:00.000Z',
  requestedName: null,
  requestedOrg: null,
  joinedVia: 'Summit 2026 — main stage',
  consentVersion: '2026-11-01',
  consentAt: '2026-10-01T09:05:00.000Z',
  analyticsOptIn: true,
  challenges: 2,
  requestsSent: 1,
  requestsReceived: 3,
}

type Reply = { status: number; body?: unknown }

/** Serves the member and answers each change with `replies[method]`. */
function server(replies: Partial<Record<'POST' | 'DELETE', Reply>> = {}): {
  calls: string[]
} {
  const calls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: { method?: string }) => {
      const method = init?.method ?? 'GET'
      if (method !== 'GET') calls.push(`${method} ${url}`)
      const reply =
        method === 'GET'
          ? { status: 200, body: { member: mia } }
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
  const screen = mount(MemberScreen, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  await flushPromises()
  return screen
}

afterEach(() => {
  vi.unstubAllGlobals()
  permissions.mockReset()
})

describe('MemberScreen (R-MEM-2)', () => {
  it('shows everything held about the member', async () => {
    permissions.mockReturnValue(['member:delete'])
    server()
    const screen = await shown()

    const text = screen.text()
    expect(screen.find('h1').text()).toBe('Mia Rebel')
    expect(text).toContain('Coach · Buurtzorg')
    expect(text).toContain('mia@example.invalid')
    expect(text).toContain('Summit 2026 — main stage')
    expect(text).toContain('Version 2026-11-01')
    expect(text).toContain('Opted in')
    expect(text).toContain('Connection requests received')
  })

  it('lists roles without boxes for a host who cannot grant them', async () => {
    permissions.mockReturnValue(['member:delete'])
    server()
    const screen = await shown()

    expect(screen.find('input[type="checkbox"]').exists()).toBe(false)
  })

  it('gives and takes away a role with its box (R-ROLE-9)', async () => {
    permissions.mockReturnValue(['member:delete', 'role:grant'])
    const { calls } = server()
    const screen = await shown()

    const boxes = screen.findAll('input[type="checkbox"]')
    const admin = boxes.find((box) =>
      box.element.parentElement?.textContent?.includes('admin'),
    )
    await admin?.setValue(true)
    await flushPromises()

    expect(calls).toContain('POST /api/admin/members/m-mia/roles')
  })

  it('says why the last admin keeps the role', async () => {
    permissions.mockReturnValue(['member:delete', 'role:grant'])
    server({ DELETE: { status: 409, body: { result: 'last_holder' } } })
    const screen = await shown()

    const member = screen
      .findAll('input[type="checkbox"]')
      .find((box) => box.element.parentElement?.textContent?.includes('member'))
    await member?.setValue(false)
    await flushPromises()

    expect(screen.find('[role="status"]').text()).toContain('Nobody else')
    expect((member?.element as HTMLInputElement).checked).toBe(true)
  })

  it('asks before deleting, and deletes on confirmation (R-NFR-7)', async () => {
    permissions.mockReturnValue(['member:delete'])
    const { calls } = server()
    const screen = await shown()

    await screen.find('button.btn-ghost').trigger('click')
    expect(screen.find('[role="alert"]').text()).toContain('cannot be undone')
    expect(calls).toEqual([])

    await screen.find('button.btn-dark').trigger('click')
    await flushPromises()

    expect(calls).toEqual(['DELETE /api/admin/members/m-mia'])
    expect(screen.find('h1').text()).toBe('Deleted')
  })

  it('says why the only admin stays', async () => {
    permissions.mockReturnValue(['member:delete'])
    server({ DELETE: { status: 409, body: { result: 'last_admin' } } })
    const screen = await shown()

    await screen.find('button.btn-ghost').trigger('click')
    await screen.find('button.btn-dark').trigger('click')
    await flushPromises()

    expect(screen.find('[role="status"]').text()).toContain('only admin left')
  })
})
