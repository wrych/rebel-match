// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SocialLinksSetting from './SocialLinksSetting.vue'

function server(status = 204): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
    Promise.resolve(
      init?.method === 'PUT'
        ? { ok: status < 300, status }
        : {
            ok: true,
            status: 200,
            json: async () => ({
              limits: { savedTickMs: 2500, socialLinkMaxChars: 200 },
            }),
          },
    ),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const saved = {
  linkedin: 'https://www.linkedin.com/in/ada',
  instagram: null,
}

async function mounted(): Promise<ReturnType<typeof mount>> {
  const setting = mount(SocialLinksSetting, { props: { links: saved } })
  await flushPromises()
  return setting
}

async function type(
  setting: ReturnType<typeof mount>,
  selector: string,
  value: string,
): Promise<void> {
  const input = setting.find(selector)
  await input.setValue(value)
  await input.trigger('change')
  await flushPromises()
}

function puts(fetchMock: ReturnType<typeof vi.fn>): unknown[] {
  return fetchMock.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === 'PUT')
    .map(([url, init]) => [
      url,
      JSON.parse((init as RequestInit).body as string),
    ])
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SocialLinksSetting (R-PROF-5)', () => {
  it('shows the links the member saved', async () => {
    server()
    const setting = await mounted()

    expect(
      (setting.find('#social-linkedin').element as HTMLInputElement).value,
    ).toBe(saved.linkedin)
    expect(
      (setting.find('#social-instagram').element as HTMLInputElement).value,
    ).toBe('')
  })

  it('saves both links on change, the typed one as its address, and ticks it', async () => {
    const fetchMock = server()
    const setting = await mounted()

    await type(setting, '#social-instagram', '@ada')

    expect(puts(fetchMock)).toEqual([
      [
        '/api/me/social-links',
        {
          linkedin: saved.linkedin,
          instagram: 'https://www.instagram.com/ada',
        },
      ],
    ])
    expect(
      (setting.find('#social-instagram').element as HTMLInputElement).value,
    ).toBe('https://www.instagram.com/ada')
    expect(setting.findAll('.field')[1]!.text()).toContain('Saved')
  })

  it('refuses an address on another site, says why, and saves nothing', async () => {
    const fetchMock = server()
    const setting = await mounted()

    await type(setting, '#social-linkedin', 'https://example.org/ada')

    expect(puts(fetchMock)).toEqual([])
    expect(setting.find('[role="alert"]').text()).toContain(
      'not a LinkedIn profile',
    )
  })

  it('says a failed save failed, and keeps what was typed', async () => {
    server(500)
    const setting = await mounted()

    await type(setting, '#social-linkedin', '')

    expect(setting.find('[role="alert"]').text()).toContain('did not save')
    expect(setting.findAll('.field')[0]!.text()).not.toContain('Saved')
  })

  it('tells the member who sees the links', async () => {
    server()

    expect((await mounted()).text()).toContain(
      'Shown only to members you are connected with',
    )
  })
})
