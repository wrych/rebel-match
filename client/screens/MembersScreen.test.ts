// @vitest-environment jsdom
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MembersScreen from './MembersScreen.vue'

const mia = {
  id: 'm-mia',
  email: 'mia@example.invalid',
  name: 'Mia Rebel',
  jobTitle: 'Coach',
  org: 'Buurtzorg',
  sector: 'Health',
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
  status: 'applicant',
  roles: [],
  joinedAt: '2026-10-02T09:00:00.000Z',
}

function respond(ok = true): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok,
      status: ok ? 200 : 500,
      json: async () => ({ members: [ben, mia] }),
    }),
  )
}

async function shown(): Promise<ReturnType<typeof mount>> {
  const screen = mount(MembersScreen, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  await flushPromises()
  return screen
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('MembersScreen (R-MEM-1)', () => {
  it('shows each member with the lines the app shows a person by', async () => {
    respond()
    const screen = await shown()

    const card = screen.findAll('.member')[1]
    expect(card?.find('.card-title').text()).toBe('Mia Rebel')
    expect(card?.find('.line').text()).toBe('Coach · Buurtzorg · Health')
    expect(card?.text()).toContain('mia@example.invalid')
    expect(card?.text()).toContain('admin')
    expect(card?.text()).toContain('active')
  })

  it('names someone without a name by their email', async () => {
    respond()
    const screen = await shown()

    expect(screen.findAll('.member')[0]?.find('.card-title').text()).toBe(
      'ben@example.invalid',
    )
  })

  it("opens a member's page from their card (R-MEM-2)", async () => {
    respond()
    const screen = await shown()

    const links = screen.findAllComponents(RouterLinkStub)
    expect(links.map((link) => link.props('to'))).toEqual([
      '/admin/members/m-ben',
      '/admin/members/m-mia',
    ])
  })

  it('narrows the list by search', async () => {
    respond()
    const screen = await shown()

    await screen.find('#member-search').setValue('mia')

    expect(screen.findAll('.member')).toHaveLength(1)
  })

  it('says so when the members cannot be loaded', async () => {
    respond(false)
    const screen = await shown()

    expect(screen.find('[role="alert"]').text()).toContain('could not')
  })
})
