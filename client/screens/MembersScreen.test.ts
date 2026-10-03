// @vitest-environment jsdom
import { flushPromises, mount, type DOMWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MembersScreen from './MembersScreen.vue'

const mia = {
  id: 'm-mia',
  email: 'mia@example.invalid',
  name: 'Mia Rebel',
  status: 'active',
  roles: ['member'],
  joinedAt: '2026-10-01T09:00:00.000Z',
}
const ben = {
  id: 'm-ben',
  email: 'ben@example.invalid',
  name: null,
  status: 'applicant',
  roles: [],
  joinedAt: '2026-10-02T09:00:00.000Z',
}

/** Serves the roster, then answers a DELETE with `status` and `body`; an
 * erased member leaves the roster. */
function server(
  status = 204,
  body: unknown = undefined,
): ReturnType<typeof vi.fn> {
  let roster = [ben, mia]
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === 'DELETE') {
      if (status === 204) roster = roster.filter((m) => !url.endsWith(m.id))
      return Promise.resolve({
        ok: status < 300,
        status,
        json: async () => body,
      })
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({ members: roster }),
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function mountScreen(): Promise<ReturnType<typeof mount>> {
  const screen = mount(MembersScreen)
  await flushPromises()
  return screen
}

function button(
  screen: ReturnType<typeof mount>,
  label: string,
): DOMWrapper<HTMLButtonElement> {
  const found = screen
    .findAll<HTMLButtonElement>('button')
    .find((b) => b.text() === label)
  if (found === undefined) throw new Error(`no button ${label}`)
  return found
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('MembersScreen', () => {
  it('lists members with email, roles and status', async () => {
    server()

    const text = (await mountScreen()).text()

    expect(text).toContain('Mia Rebel')
    expect(text).toContain('mia@example.invalid')
    expect(text).toContain('member')
    expect(text).toContain('ben@example.invalid')
    expect(text).toContain('applicant')
  })

  it('narrows the list by search', async () => {
    server()
    const screen = await mountScreen()

    await screen.find('input').setValue('mia')

    expect(screen.text()).not.toContain('ben@example.invalid')
    expect(screen.text()).toContain('mia@example.invalid')
  })

  it('asks before deleting, and Keep sends nothing', async () => {
    const fetchMock = server()
    const screen = await mountScreen()

    await button(screen, 'Delete…').trigger('click')
    expect(screen.find('[role="alert"]').text()).toContain('cannot be undone')
    await button(screen, 'Keep').trigger('click')

    expect(screen.find('[role="alert"]').exists()).toBe(false)
    expect(
      fetchMock.mock.calls.some(
        ([, init]) => (init as RequestInit | undefined)?.method === 'DELETE',
      ),
    ).toBe(false)
  })

  it('deletes on confirmation and drops the row (R-NFR-7)', async () => {
    const fetchMock = server()
    const screen = await mountScreen()

    await button(screen, 'Delete…').trigger('click')
    await button(screen, 'Delete for good').trigger('click')
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith('/api/admin/members/m-ben', {
      method: 'DELETE',
    })
    expect(screen.find('[role="status"]').text()).toContain(
      'Deleted ben@example.invalid',
    )
    expect(screen.text()).not.toContain('Delete for good')
    expect(screen.findAll('article')).toHaveLength(1)
  })

  it('says why the last admin stays (R-ROLE-9)', async () => {
    server(409, { result: 'last_admin' })
    const screen = await mountScreen()

    await button(screen, 'Delete…').trigger('click')
    await button(screen, 'Delete for good').trigger('click')
    await flushPromises()

    expect(screen.find('[role="status"]').text()).toContain('only admin')
    expect(screen.findAll('article')).toHaveLength(2)
  })
})
