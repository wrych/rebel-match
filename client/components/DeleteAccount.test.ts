// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DeleteAccount from './DeleteAccount.vue'

const replace = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ replace }) }))
const forgetMe = vi.fn()
vi.mock('../lib/session', () => ({ forgetMe: () => forgetMe() as unknown }))

function respond(status: number, body?: unknown): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status < 300,
    status,
    json: async () => body,
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function confirmDelete(screen: ReturnType<typeof mount>): Promise<void> {
  await screen.find('button').trigger('click')
  await screen.find('button.btn-dark').trigger('click')
  await flushPromises()
}

afterEach(() => {
  vi.unstubAllGlobals()
  replace.mockReset()
  forgetMe.mockReset()
})

describe('DeleteAccount (R-PROF-2)', () => {
  it('says what goes and when, and asks once before deleting anything (ADR 0032)', async () => {
    const fetchMock = respond(200, { eraseAfter: '2026-11-04T10:00:00.000Z' })
    const screen = mount(DeleteAccount, { props: { graceDays: 30 } })

    expect(screen.text()).toContain('After 30 days')
    expect(screen.text()).toContain('keep your account')
    await screen.find('button').trigger('click')

    expect(screen.find('[role="alert"]').text()).toContain('erased in 30 days')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('Keep it sends nothing', async () => {
    const fetchMock = respond(200, {})
    const screen = mount(DeleteAccount, { props: { graceDays: 30 } })

    await screen.find('button').trigger('click')
    await screen.find('button.btn-ghost').trigger('click')

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.text()).toContain('Delete my account…')
  })

  it('deletes the account, forgets the session and goes to the login screen', async () => {
    const fetchMock = respond(200, { eraseAfter: '2026-11-04T10:00:00.000Z' })
    const screen = mount(DeleteAccount, { props: { graceDays: 30 } })

    await confirmDelete(screen)

    expect(fetchMock).toHaveBeenCalledWith('/api/profile', { method: 'DELETE' })
    expect(forgetMe).toHaveBeenCalled()
    expect(replace).toHaveBeenCalledWith(
      '/login?account=deleted&until=2026-11-04T10%3A00%3A00.000Z',
    )
  })

  it.each([
    ['last_admin', 'only one who can give roles'],
    ['created_invites', 'Invite links you created'],
  ])('says why a %s account stays', async (result, words) => {
    respond(409, { result })
    const screen = mount(DeleteAccount, { props: { graceDays: 30 } })

    await confirmDelete(screen)

    expect(screen.find('[role="alert"]').text()).toContain(words)
    expect(replace).not.toHaveBeenCalled()
  })

  it('says the account is still there when the request fails', async () => {
    respond(500)
    const screen = mount(DeleteAccount, { props: { graceDays: 30 } })

    await confirmDelete(screen)

    expect(screen.find('[role="alert"]').text()).toContain('still here')
  })
})
