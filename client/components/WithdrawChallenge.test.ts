// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import WithdrawChallenge from './WithdrawChallenge.vue'

const EYE = 'button[aria-label="Withdraw this challenge"]'

function respond(status: number): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status < 300,
    status,
    json: async () => ({}),
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function mountFor(): ReturnType<typeof mount> {
  return mount(WithdrawChallenge, {
    props: { challengeId: 'c 1' },
    slots: { default: '<div class="card">My challenge</div>' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('WithdrawChallenge (R-ASK-17)', () => {
  it('shows the challenge with a crossed eye to withdraw it, none when not offered', () => {
    const screen = mountFor()
    const off = mount(WithdrawChallenge, {
      props: { challengeId: 'c 1', offered: false },
      slots: { default: '<div class="card">My challenge</div>' },
    })

    expect(screen.text()).toContain('My challenge')
    expect(screen.find(`${EYE} svg`).exists()).toBe(true)
    expect(off.find(EYE).exists()).toBe(false)
  })

  it('asks once, saying it cannot be undone, before sending anything', async () => {
    const fetchMock = respond(204)
    const screen = mountFor()

    await screen.find(EYE).trigger('click')

    expect(screen.find('[role="alert"]').text()).toContain(
      'This cannot be undone.',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('Keep it sends nothing and offers Withdraw again', async () => {
    const fetchMock = respond(204)
    const screen = mountFor()

    await screen.find(EYE).trigger('click')
    await screen.find('button.btn-ghost').trigger('click')

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.find(EYE).exists()).toBe(true)
  })

  it.each([204, 404])(
    'withdraws the challenge and says so when the server answers %i',
    async (status) => {
      const fetchMock = respond(status)
      const screen = mountFor()

      await screen.find(EYE).trigger('click')
      await screen.find('button.btn-dark').trigger('click')
      await flushPromises()

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/challenges/c%201/withdraw',
        expect.objectContaining({ method: 'POST' }),
      )
      expect(screen.emitted('withdrawn')).toHaveLength(1)
    },
  )

  it('keeps the challenge up and says so when the server fails', async () => {
    respond(500)
    const screen = mountFor()

    await screen.find(EYE).trigger('click')
    await screen.find('button.btn-dark').trigger('click')
    await flushPromises()

    expect(screen.emitted('withdrawn')).toBeUndefined()
    expect(screen.text()).toContain('Your challenge is still up.')
  })
})
