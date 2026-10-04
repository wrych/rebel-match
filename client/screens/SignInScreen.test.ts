// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SignInScreen from './SignInScreen.vue'

const replace = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ replace }) }))

function respond(status: number, body: unknown): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function openLink(hash: string): ReturnType<typeof mount> {
  window.history.replaceState(null, '', `/sign-in${hash}`)
  return mount(SignInScreen)
}

afterEach(() => {
  vi.unstubAllGlobals()
  replace.mockReset()
  window.history.replaceState(null, '', '/')
})

describe('SignInScreen (ADR 0027)', () => {
  it('uses nothing until the button is pressed (R-AUTH-5)', async () => {
    const fetchMock = respond(200, { next: '/welcome' })

    openLink('#token=abc')
    await flushPromises()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })

  it('signs in on the button and goes where the link said', async () => {
    const fetchMock = respond(200, { next: '/matches' })
    const screen = openLink('#token=abc')

    await screen.find('button').trigger('click')
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith(
      '/auth/verify',
      expect.objectContaining({ body: '{"token":"abc"}' }),
    )
    expect(replace).toHaveBeenCalledWith('/matches')
  })

  it('sends a dead link to the login notice (R-AUTH-6)', async () => {
    respond(400, { reason: 'expired' })
    const screen = openLink('#token=abc')

    await screen.find('button').trigger('click')
    await flushPromises()

    expect(replace).toHaveBeenCalledWith('/login?link=expired')
  })

  it('says so and stays when the server cannot be reached', async () => {
    respond(503, {})
    const screen = openLink('#token=abc')

    await screen.find('button').trigger('click')
    await flushPromises()

    expect(replace).not.toHaveBeenCalled()
    expect(screen.find('[role="alert"]').text()).toContain('try again')
    expect(screen.find('button').attributes('disabled')).toBeUndefined()
  })

  it('sends a link without a token to the login notice', async () => {
    respond(200, {})

    openLink('')
    await flushPromises()

    expect(replace).toHaveBeenCalledWith('/login?link=unknown')
  })
})
