// @vitest-environment jsdom
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { consentWordsOf, latestConsentVersion } from '../../src/consent'
import ProfileScreen from './ProfileScreen.vue'

const profile = {
  name: 'Ada',
  jobTitle: 'Coach',
  org: null,
  sector: 'retail',
  companySize: null,
  email: 'ada@example.invalid',
  consentVersion: latestConsentVersion,
  consentAt: '2026-11-08T10:00:00.000Z',
  analyticsOptIn: false,
}
const config = {
  limits: {
    nameMaxChars: 120,
    jobTitleMaxChars: 120,
    orgMaxChars: 160,
    savedTickMs: 2500,
  },
  analyticsVersion: '2026-10-05',
  feedbackTo: 'host@example.org',
}

/** Serves the profile and config, and answers each save with `status`. */
function server(status = 204, own = profile): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === 'PUT')
      return Promise.resolve({ ok: status < 300, status })
    const body = url === '/api/config' ? config : own
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function mountScreen(): Promise<ReturnType<typeof mount>> {
  const screen = mount(ProfileScreen, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  await flushPromises()
  return screen
}

function saves(fetchMock: ReturnType<typeof vi.fn>): unknown[] {
  return fetchMock.mock.calls
    .filter(
      ([url, init]) =>
        url === '/api/profile' &&
        (init as RequestInit | undefined)?.method === 'PUT',
    )
    .map(([, init]) => JSON.parse((init as RequestInit).body as string))
}

async function change(
  screen: ReturnType<typeof mount>,
  selector: string,
  value: string,
): Promise<void> {
  const input = screen.find(selector)
  await input.setValue(value)
  await input.trigger('change')
  await flushPromises()
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('ProfileScreen', () => {
  it('shows the profile, the email read-only, and no save button (R-PROF-1)', async () => {
    server()
    const screen = await mountScreen()

    expect((screen.find('#name').element as HTMLInputElement).value).toBe('Ada')
    expect((screen.find('#job-title').element as HTMLInputElement).value).toBe(
      'Coach',
    )
    expect(screen.text()).toContain('ada@example.invalid')
    expect(screen.find('input[type="email"]').exists()).toBe(false)
    expect(
      screen.findAll('button').filter((b) => /save/i.test(b.text())),
    ).toHaveLength(0)
  })

  it('saves a field on change and ticks it (R-PROF-1)', async () => {
    const fetchMock = server()
    const screen = await mountScreen()

    await change(screen, '#org', '  Rebels  ')

    expect(saves(fetchMock)).toEqual([
      {
        name: 'Ada',
        jobTitle: 'Coach',
        org: 'Rebels',
        sector: 'retail',
        companySize: '',
      },
    ])
    const org = screen.findAll('.field')[2]!
    expect(org.find('[role="status"]').text()).toContain('Saved')
  })

  it('saves a sector and company size picked from the lists (R-PROF-1)', async () => {
    const fetchMock = server()
    const screen = await mountScreen()

    expect((screen.find('#sector').element as HTMLSelectElement).value).toBe(
      'retail',
    )
    await change(screen, '#company-size', '1001+')
    await change(screen, '#sector', '')

    expect(saves(fetchMock)).toEqual([
      {
        name: 'Ada',
        jobTitle: 'Coach',
        org: '',
        sector: 'retail',
        companySize: '1001+',
      },
      {
        name: 'Ada',
        jobTitle: 'Coach',
        org: '',
        sector: '',
        companySize: '1001+',
      },
    ])
    const size = screen.findAll('.field')[4]!
    expect(size.find('[role="status"]').text()).toContain('Saved')
  })

  it('blanks a stored sector that is not on the list, so saves still go through', async () => {
    const fetchMock = server(204, { ...profile, sector: 'Software · 260' })
    const screen = await mountScreen()

    await change(screen, '#org', 'Rebels')

    expect(saves(fetchMock)).toEqual([
      {
        name: 'Ada',
        jobTitle: 'Coach',
        org: 'Rebels',
        sector: '',
        companySize: '',
      },
    ])
  })

  it('takes the tick away again after a moment', async () => {
    vi.useFakeTimers()
    server()
    const screen = await mountScreen()

    await change(screen, '#org', 'Rebels')
    vi.advanceTimersByTime(3000)
    await flushPromises()

    expect(screen.findAll('.field')[2]!.find('[role="status"]').text()).toBe('')
  })

  it('saves quick edits in turn, so the second keeps the first (R-PROF-1)', async () => {
    const fetchMock = server()
    const screen = await mountScreen()

    await screen.find('#name').setValue('Ada Rebel')
    await screen.find('#name').trigger('change')
    await screen.find('#org').setValue('Rebels')
    await screen.find('#org').trigger('change')
    await flushPromises()

    expect(saves(fetchMock)).toEqual([
      {
        name: 'Ada Rebel',
        jobTitle: 'Coach',
        org: '',
        sector: 'retail',
        companySize: '',
      },
      {
        name: 'Ada Rebel',
        jobTitle: 'Coach',
        org: 'Rebels',
        sector: 'retail',
        companySize: '',
      },
    ])
  })

  it('does not save an unchanged field', async () => {
    const fetchMock = server()
    const screen = await mountScreen()

    await change(screen, '#name', ' Ada ')

    expect(saves(fetchMock)).toEqual([])
  })

  it('refuses an empty name, saying why, and saves nothing (R-PROF-1)', async () => {
    const fetchMock = server()
    const screen = await mountScreen()

    await change(screen, '#name', '   ')

    expect(saves(fetchMock)).toEqual([])
    expect(screen.find('#name-error').text()).toContain('cannot be empty')
  })

  it('says a save failed and keeps what was typed (R-PROF-1)', async () => {
    server(500)
    const screen = await mountScreen()

    await change(screen, '#job-title', 'Head of nothing')

    expect((screen.find('#job-title').element as HTMLInputElement).value).toBe(
      'Head of nothing',
    )
    expect(screen.text()).toContain('did not save')
    expect(screen.text()).not.toContain('Saved')
  })

  it('shows the accepted terms with their version and date (R-PROF-2)', async () => {
    server()
    const text = (await mountScreen()).text()

    expect(text).toContain(`Version ${latestConsentVersion}`)
    for (const paragraph of consentWordsOf(latestConsentVersion)) {
      expect(text).toContain(paragraph)
    }
  })

  it('links the privacy notice and the terms of use (R-PROF-2, R-ONB-13)', async () => {
    server()
    const screen = await mountScreen()

    const targets = screen
      .findAllComponents(RouterLinkStub)
      .map((link) => link.props('to'))
    expect(targets).toEqual(expect.arrayContaining(['/privacy', '/terms']))
  })

  it('carries the analytics opt-in and offers deleting the account (R-PROF-2)', async () => {
    server()
    const screen = await mountScreen()

    expect(screen.text()).toContain(
      'Help improve Rebel Match (optional data collection)',
    )
    expect(screen.find('#delete-heading').text()).toBe('Delete your account')
  })
})
