// @vitest-environment jsdom
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { consentWordsOf, latestConsentVersion } from '../../src/consent'
import { forgetTyped, keepTyped, typedProfile } from '../lib/onboarding'
import { forgetMe } from '../lib/session'
import OnboardingPrivacyScreen from './OnboardingPrivacyScreen.vue'

const push = vi.fn()
const replace = vi.fn()
const route = { query: {} as Record<string, string> }
vi.mock('vue-router', () => ({
  useRouter: () => ({ push, replace }),
  useRoute: () => route,
}))

const ada = {
  name: 'Ada',
  jobTitle: 'Coach',
  org: '',
  sector: '',
  companySize: '',
}
const stored = {
  name: null as string | null,
  jobTitle: null,
  org: null,
  sector: null,
  companySize: null,
  consentVersion: latestConsentVersion,
}

function server(
  options: { status?: number; optedIn?: boolean; draft?: typeof stored } = {},
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const status = options.status ?? 204
      return Promise.resolve({ ok: status < 300, status })
    }
    const bodies: Record<string, unknown> = {
      '/api/config': { limits: { scrollHintShare: 0.6 } },
      '/auth/me': {
        id: 'm',
        name: null,
        onboarded: false,
        analyticsOptIn: options.optedIn ?? false,
        roles: [],
        permissions: [],
      },
      '/api/onboarding': options.draft ?? stored,
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => bodies[url],
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function mountScreen(): Promise<ReturnType<typeof mount>> {
  const screen = mount(OnboardingPrivacyScreen, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  await flushPromises()
  return screen
}

function posted(fetchMock: ReturnType<typeof vi.fn>): unknown[] {
  return fetchMock.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST')
    .map(([, init]) => JSON.parse((init as RequestInit).body as string))
}

function confirmButton(
  screen: ReturnType<typeof mount>,
): ReturnType<ReturnType<typeof mount>['find']> {
  return screen.find('button.btn-primary')
}

beforeEach(() => {
  forgetMe()
  keepTyped(ada)
})

afterEach(() => {
  vi.unstubAllGlobals()
  push.mockReset()
  replace.mockReset()
  route.query = {}
  forgetTyped()
})

describe('OnboardingPrivacyScreen', () => {
  it('shows step 2 and the consent words under their headings (R-ONB-3,5,6)', async () => {
    server()
    const screen = await mountScreen()

    expect(screen.find('[aria-current="step"]').text()).toContain('Privacy')
    for (const paragraph of consentWordsOf(latestConsentVersion)) {
      if (typeof paragraph === 'string') continue
      expect(screen.text()).toContain(paragraph.heading)
      expect(screen.text()).toContain(paragraph.text)
    }
  })

  it('links the privacy notice and the terms of use (R-ONB-9, R-ONB-13)', async () => {
    server()
    const targets = (await mountScreen())
      .findAllComponents(RouterLinkStub)
      .map((link) => link.props('to'))

    expect(targets).toEqual(['/privacy', '/terms'])
  })

  it('offers one button, which says it saves the profile (R-ONB-3, R-ONB-8)', async () => {
    server()
    const screen = await mountScreen()

    expect(screen.findAll('input[type="checkbox"]')).toHaveLength(0)
    expect(confirmButton(screen).text()).toBe(
      'I have read the privacy notice and the terms of use',
    )
    expect(screen.text()).toContain(
      'Your profile is saved when you tap this button.',
    )
  })

  it('stores profile and consent in one request, then asks about usage data (R-ONB-8, R-ONB-11)', async () => {
    const fetchMock = server()
    route.query = { next: '/matches' }
    const screen = await mountScreen()
    await confirmButton(screen).trigger('click')
    await flushPromises()

    expect(posted(fetchMock)).toEqual([
      { ...ada, consentVersion: latestConsentVersion },
    ])
    expect(typedProfile()).toBeNull()
    expect(push).toHaveBeenCalledWith('/onboarding/usage?next=%2Fmatches')
  })

  it('skips the usage step for a member opted in to the current words (R-ONB-11)', async () => {
    server({ optedIn: true })
    route.query = { next: '/matches' }
    const screen = await mountScreen()
    await confirmButton(screen).trigger('click')
    await flushPromises()

    expect(push).toHaveBeenCalledWith('/matches')
  })

  it('confirms new words with the stored profile of a returning member (F2, R-ONB-4)', async () => {
    forgetTyped()
    const fetchMock = server({ draft: { ...stored, name: 'Ada Stored' } })
    const screen = await mountScreen()
    await confirmButton(screen).trigger('click')
    await flushPromises()

    expect(posted(fetchMock)).toEqual([
      {
        name: 'Ada Stored',
        jobTitle: '',
        org: '',
        sector: '',
        companySize: '',
        consentVersion: latestConsentVersion,
      },
    ])
  })

  it('goes back to the profile step when there is no profile to store (R-ONB-7)', async () => {
    forgetTyped()
    server()
    await mountScreen()

    expect(replace).toHaveBeenCalledWith('/onboarding')
  })

  it('asks again when the words changed while reading (R-ONB-4)', async () => {
    server({ status: 409 })
    const screen = await mountScreen()
    await confirmButton(screen).trigger('click')
    await flushPromises()

    expect(screen.find('[role="alert"]').text()).toContain(
      'The words have just changed',
    )
    expect(push).not.toHaveBeenCalled()
    expect(typedProfile()).toEqual(ada)
  })

  it('says a failed save failed and keeps the profile', async () => {
    server({ status: 500 })
    const screen = await mountScreen()
    await confirmButton(screen).trigger('click')
    await flushPromises()

    expect(screen.find('[role="alert"]').text()).toBe(
      'That did not save. Try again.',
    )
    expect(typedProfile()).toEqual(ada)
  })
})

describe('the scroll hint (R-ONB-10)', () => {
  let report: (visible: boolean) => void = () => undefined

  beforeEach(() => {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          report = (visible) =>
            callback(
              [{ isIntersecting: visible } as IntersectionObserverEntry],
              this as unknown as IntersectionObserver,
            )
        }
        observe(): void {}
        disconnect(): void {}
      },
    )
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
  })

  it('shows while the button is out of view and goes once it shows', async () => {
    server()
    const screen = await mountScreen()

    report(false)
    await flushPromises()
    expect(screen.find('[aria-label="Scroll down"]').exists()).toBe(true)

    report(true)
    await flushPromises()
    expect(screen.find('[aria-label="Scroll down"]').exists()).toBe(false)
  })

  it('scrolls by part of the visible height, never to the end', async () => {
    server()
    const scrollBy = vi.fn()
    vi.stubGlobal('scrollBy', scrollBy)
    const screen = await mountScreen()
    report(false)
    await flushPromises()

    await screen.find('[aria-label="Scroll down"]').trigger('click')

    expect(scrollBy).toHaveBeenCalledWith({
      top: window.innerHeight * 0.6,
      behavior: 'smooth',
    })
  })

  it('moves without animation for a member who prefers less motion', async () => {
    server()
    const scrollBy = vi.fn()
    vi.stubGlobal('scrollBy', scrollBy)
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const screen = await mountScreen()
    report(false)
    await flushPromises()

    await screen.find('[aria-label="Scroll down"]').trigger('click')

    expect(scrollBy).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: 'auto' }),
    )
  })

  it('leaves the button working without scrolling first', async () => {
    const fetchMock = server()
    const screen = await mountScreen()
    report(false)
    await flushPromises()

    await confirmButton(screen).trigger('click')
    await flushPromises()

    expect(posted(fetchMock)).toHaveLength(1)
  })
})
