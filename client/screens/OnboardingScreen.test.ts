// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { consentWordsOf, latestConsentVersion } from '../../src/consent'
import OnboardingScreen from './OnboardingScreen.vue'

const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

const draft = {
  name: 'Door Name',
  jobTitle: null,
  org: 'Door Org',
  sector: 'Health',
  consentVersion: latestConsentVersion,
}
const limits = {
  nameMaxChars: 120,
  jobTitleMaxChars: 120,
  orgMaxChars: 160,
  sectorMaxChars: 160,
}

/** Serves the draft and config, and answers the submission with `status`. */
function server(status = 204): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === 'POST')
      return Promise.resolve({ ok: status < 300, status })
    const body = url === '/api/config' ? { limits } : draft
    return Promise.resolve({ ok: true, status: 200, json: async () => body })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function mountScreen(): Promise<ReturnType<typeof mount>> {
  const screen = mount(OnboardingScreen)
  await flushPromises()
  return screen
}

async function acceptAndSubmit(
  screen: ReturnType<typeof mount>,
): Promise<void> {
  await screen.find('input[type="checkbox"]').setValue(true)
  await screen.find('form').trigger('submit')
  await flushPromises()
}

afterEach(() => {
  vi.unstubAllGlobals()
  push.mockReset()
  window.history.replaceState(null, '', '/')
})

describe('OnboardingScreen', () => {
  it('pre-fills what they gave at the door (F2, R-AUTH-12)', async () => {
    server()
    const screen = await mountScreen()

    expect((screen.find('#name').element as HTMLInputElement).value).toBe(
      'Door Name',
    )
    expect((screen.find('#org').element as HTMLInputElement).value).toBe(
      'Door Org',
    )
  })

  it('shows the consent words for the version it will record (R-ONB-3,5)', async () => {
    server()
    const text = (await mountScreen()).text()

    for (const paragraph of consentWordsOf(latestConsentVersion)) {
      expect(text).toContain(paragraph)
    }
  })

  it('keeps Continue disabled until consent is ticked and a name is given (R-ONB-1)', async () => {
    server()
    const screen = await mountScreen()
    const button = screen.find('button[type="submit"]')

    expect(button.attributes('disabled')).toBeDefined()
    await screen.find('input[type="checkbox"]').setValue(true)
    expect(button.attributes('disabled')).toBeUndefined()
    await screen.find('#name').setValue('   ')
    expect(button.attributes('disabled')).toBeDefined()
  })

  it('submits with the consent version and goes on to next (R-NAV-7)', async () => {
    const fetchMock = server()
    window.history.replaceState(null, '', '/onboarding?next=%2Fmatches')
    const screen = await mountScreen()
    await screen.find('#job-title').setValue('Coach')

    await acceptAndSubmit(screen)

    const [, init] = fetchMock.mock.calls.find(
      ([, options]) => (options as RequestInit | undefined)?.method === 'POST',
    ) as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({
      name: 'Door Name',
      jobTitle: 'Coach',
      org: 'Door Org',
      sector: 'Health',
      consentVersion: latestConsentVersion,
    })
    expect(push).toHaveBeenCalledWith('/matches')
  })

  it('asks them to read again when the terms changed meanwhile, keeping their edits (R-ONB-4)', async () => {
    server(409)
    const screen = await mountScreen()
    await screen.find('#name').setValue('Ada Rebel')

    await acceptAndSubmit(screen)

    expect((screen.find('#name').element as HTMLInputElement).value).toBe(
      'Ada Rebel',
    )
    expect(screen.find('[role="alert"]').text()).toContain('read them again')
    expect(
      (screen.find('input[type="checkbox"]').element as HTMLInputElement)
        .checked,
    ).toBe(false)
    expect(push).not.toHaveBeenCalled()
  })

  it('says so when saving fails', async () => {
    server(500)
    const screen = await mountScreen()

    await acceptAndSubmit(screen)

    expect(screen.find('[role="alert"]').text()).toContain('did not save')
  })
})
