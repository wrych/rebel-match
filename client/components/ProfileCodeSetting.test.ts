// @vitest-environment jsdom
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ProfileCodeSetting from './ProfileCodeSetting.vue'

function answer(status: number, body: unknown = {}): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({ ok: status < 300, status, json: async () => body }),
    ),
  )
}

async function mounted(): Promise<ReturnType<typeof mount>> {
  const setting = mount(ProfileCodeSetting, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  await flushPromises()
  return setting
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ProfileCodeSetting (R-CODE-4)', () => {
  it('offers on / off, reset and the way to show the code', async () => {
    answer(200, { token: 't', enabled: true })
    const setting = await mounted()

    expect(setting.text()).toContain('Profile code: on')
    expect(setting.text()).toContain('Reset code')
    expect(setting.findComponent(RouterLinkStub).props('to')).toBe(
      '/me/code?tab=profile',
    )
  })

  it('shows nothing while hosts have codes off', async () => {
    answer(404)
    const setting = await mounted()

    expect(setting.html()).not.toContain('Profile code')
  })
})
