// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  analyticsWordsOf,
  latestAnalyticsVersion,
} from '../../src/analytics-consent'
import { consentWordsOf, latestConsentVersion } from '../../src/consent'
import OnboardingScreen from './OnboardingScreen.vue'

const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

const draft = {
  name: 'Door Name',
  jobTitle: null,
  org: 'Door Org',
  sector: 'healthcare',
  companySize: null,
  consentVersion: latestConsentVersion,
  analyticsVersion: latestAnalyticsVersion,
  analyticsOptIn: false,
}
const limits = {
  nameMaxChars: 120,
  jobTitleMaxChars: 120,
  orgMaxChars: 160,
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
    await screen.find('#company-size').setValue('51-250')

    await acceptAndSubmit(screen)

    const [, init] = fetchMock.mock.calls.find(
      ([, options]) => (options as RequestInit | undefined)?.method === 'POST',
    ) as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({
      name: 'Door Name',
      jobTitle: 'Coach',
      org: 'Door Org',
      sector: 'healthcare',
      companySize: '51-250',
      consentVersion: latestConsentVersion,
    })
    expect(push).toHaveBeenCalledWith('/matches')
  })

  it('offers sector and company size as optional picks, pre-filled (R-ONB-2)', async () => {
    server()
    const screen = await mountScreen()

    const sector = screen.find('#sector').element as HTMLSelectElement
    const size = screen.find('#company-size').element as HTMLSelectElement
    expect(sector.value).toBe('healthcare')
    expect(size.value).toBe('')
    expect([...size.options].map((option) => option.text)).toEqual([
      'Not given',
      '1–10 employees',
      '11–50 employees',
      '51–250 employees',
      '251–1,000 employees',
      '1,001+ employees',
    ])
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

  it('offers analytics as a separate box, unticked, with its words (R-ANA-4)', async () => {
    server()
    const screen = await mountScreen()

    const boxes = screen.findAll('input[type="checkbox"]')
    expect(boxes).toHaveLength(2)
    expect((boxes[1]!.element as HTMLInputElement).checked).toBe(false)
    for (const paragraph of analyticsWordsOf(latestAnalyticsVersion)) {
      expect(screen.text()).toContain(paragraph)
    }
  })

  it('sends the analytics words only when the box is ticked (R-ANA-4)', async () => {
    const fetchMock = server()
    const screen = await mountScreen()
    await screen.findAll('input[type="checkbox"]')[1]!.setValue(true)

    await acceptAndSubmit(screen)

    const [, init] = fetchMock.mock.calls.find(
      ([, options]) => (options as RequestInit | undefined)?.method === 'POST',
    ) as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toMatchObject({
      analyticsVersion: latestAnalyticsVersion,
    })
  })

  it('does not need the analytics box to continue', async () => {
    server()
    const screen = await mountScreen()

    await screen.find('input[type="checkbox"]').setValue(true)

    expect(
      screen.find('button[type="submit"]').attributes('disabled'),
    ).toBeUndefined()
  })

  it('says so when saving fails', async () => {
    server(500)
    const screen = await mountScreen()

    await acceptAndSubmit(screen)

    expect(screen.find('[role="alert"]').text()).toContain('did not save')
  })
})
