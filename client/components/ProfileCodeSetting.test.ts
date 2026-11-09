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
  it('offers on / off, reset and both tabs of Your code (R-CODE-1)', async () => {
    answer(200, { token: 't', enabled: true })
    const setting = await mounted()

    expect(setting.text()).toContain('Profile code: on')
    expect(setting.text()).toContain('Reset code')
    expect(
      setting.findAllComponents(RouterLinkStub).map((link) => link.props('to')),
    ).toEqual(['/me/code', '/me/code?tab=profile'])
    expect(setting.text().indexOf('Share my profile')).toBeLessThan(
      setting.text().indexOf('Profile code: on'),
    )
    expect(setting.findAll('.code-icon')).toHaveLength(2)
    expect(setting.findAll('.spinner')).toHaveLength(1)
  })

  it('shows nothing while hosts have codes off', async () => {
    answer(404)
    const setting = await mounted()

    expect(setting.html()).not.toContain('Profile code')
  })
})
