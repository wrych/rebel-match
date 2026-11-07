// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import FindableToggle from './FindableToggle.vue'

function server(status = 204): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
    Promise.resolve(
      init?.method === 'PUT'
        ? { ok: status < 300, status }
        : {
            ok: true,
            status: 200,
            json: async () => ({ limits: { savedTickMs: 2500 } }),
          },
    ),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function mounted(findable: boolean): Promise<ReturnType<typeof mount>> {
  const toggle = mount(FindableToggle, { props: { findable } })
  await flushPromises()
  return toggle
}

const box = (toggle: ReturnType<typeof mount>): HTMLInputElement =>
  toggle.find('input[type="checkbox"]').element as HTMLInputElement

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('FindableToggle (R-FIND-5)', () => {
  it.each([
    [true, true],
    [false, false],
  ])(
    'says codes still reach the member only while codes are on (%s) (R-CODE-4)',
    async (codesOn, said) => {
      server()
      const toggle = mount(FindableToggle, {
        props: { findable: true, codesOn },
      })
      await flushPromises()

      expect(toggle.text().includes('connect code you show or share')).toBe(
        said,
      )
    },
  )

  it('shows the member’s current choice', async () => {
    server()

    expect(box(await mounted(true)).checked).toBe(true)
    expect(box(await mounted(false)).checked).toBe(false)
  })

  it('saves a change at once and confirms it with the tick', async () => {
    const fetchMock = server()
    const toggle = await mounted(true)

    await toggle.find('input').setValue(false)
    await flushPromises()

    const put = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === 'PUT',
    ) as [string, RequestInit]
    expect(put[0]).toBe('/api/me/findable')
    expect(JSON.parse(String(put[1].body))).toEqual({ findable: false })
    expect(toggle.text()).toContain('Saved')
  })

  it('puts the box back and says so when the save fails', async () => {
    server(500)
    const toggle = await mounted(true)

    await toggle.find('input').setValue(false)
    await flushPromises()

    expect(box(toggle).checked).toBe(true)
    expect(toggle.find('[role="alert"]').text()).toBe(
      'That did not save. Try again.',
    )
  })

  it('says what being findable means, and that the email stays private', async () => {
    server()

    expect((await mounted(true)).text()).toContain(
      'Your email stays private until you accept.',
    )
  })
})
