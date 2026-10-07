// @vitest-environment jsdom
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { latestConsentVersion } from '../../src/consent'
import { forgetTyped, keepTyped, typedProfile } from '../lib/onboarding'
import OnboardingProfileScreen from './OnboardingProfileScreen.vue'

const push = vi.fn()
const route = { query: {} as Record<string, string> }
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  useRoute: () => route,
}))

const draft = {
  name: 'Door Name',
  jobTitle: null,
  org: 'Door Org',
  sector: 'healthcare',
  companySize: null,
  consentVersion: latestConsentVersion,
}
const limits = { nameMaxChars: 120, jobTitleMaxChars: 120, orgMaxChars: 160 }

function server(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((url: string) =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: async () => (url === '/api/config' ? { limits } : draft),
    }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function mountScreen(): Promise<ReturnType<typeof mount>> {
  const screen = mount(OnboardingProfileScreen, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  await flushPromises()
  return screen
}

const value = (screen: ReturnType<typeof mount>, selector: string): string =>
  (screen.find(selector).element as HTMLInputElement).value

afterEach(() => {
  vi.unstubAllGlobals()
  push.mockReset()
  route.query = {}
  forgetTyped()
})

describe('OnboardingProfileScreen', () => {
  it('shows step 1 of the onboarding header (R-ONB-6)', async () => {
    server()
    const screen = await mountScreen()

    expect(screen.find('[aria-current="step"]').text()).toContain('Profile')
  })

  it('pre-fills what they gave at the door (F2, R-AUTH-12)', async () => {
    server()
    const screen = await mountScreen()

    expect(value(screen, '#name')).toBe('Door Name')
    expect(value(screen, '#org')).toBe('Door Org')
    expect(value(screen, '#sector')).toBe('healthcare')
  })

  it('shows what was typed in this tab, after going back (R-ONB-12)', async () => {
    server()
    keepTyped({
      name: 'Ada',
      jobTitle: 'Coach',
      org: '',
      sector: '',
      companySize: '',
    })
    const screen = await mountScreen()

    expect(value(screen, '#name')).toBe('Ada')
    expect(value(screen, '#job-title')).toBe('Coach')
    expect(value(screen, '#org')).toBe('')
  })

  it('says nothing is sent yet and links the privacy notice (R-ONB-7)', async () => {
    server()
    const screen = await mountScreen()

    expect(screen.text()).toContain('Nothing is saved or sent yet.')
    expect(screen.findComponent(RouterLinkStub).props('to')).toBe('/privacy')
  })

  it('keeps Continue disabled without a name (R-ONB-1)', async () => {
    server()
    const screen = await mountScreen()
    await screen.find('#name').setValue('   ')

    expect(
      screen.find('button[type="submit"]').attributes('disabled'),
    ).toBeDefined()
  })

  it('keeps the profile in the tab, sends nothing, and opens the privacy step with next (R-ONB-7)', async () => {
    const fetchMock = server()
    route.query = { next: '/matches' }
    const screen = await mountScreen()
    await screen.find('#name').setValue('Ada')
    await screen.find('form').trigger('submit')
    await flushPromises()

    expect(typedProfile()).toMatchObject({ name: 'Ada', org: 'Door Org' })
    expect(
      fetchMock.mock.calls.some(
        ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
      ),
    ).toBe(false)
    expect(push).toHaveBeenCalledWith('/onboarding/privacy?next=%2Fmatches')
  })

  it('says when the form could not be loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 500 })),
    )
    const screen = await mountScreen()

    expect(screen.find('[role="alert"]').text()).toContain(
      'could not be loaded',
    )
  })
})
