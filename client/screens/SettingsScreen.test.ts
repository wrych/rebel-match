// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SettingsGroup } from '../lib/settings'
import SettingsScreen from './SettingsScreen.vue'

const session = { permissions: ['settings:read', 'settings:manage'] }
vi.mock('../lib/session', () => ({
  loadMe: () => Promise.resolve(session),
}))

const CEILING = 'abuse.linkEmailsCeiling'

function groups(ceiling = 20, changedBy?: string): SettingsGroup[] {
  return [
    {
      title: 'Spam protection',
      explanation: 'Limits that stop scripts.',
      settings: [
        {
          name: 'Sign-in emails per address, at most',
          explanation: 'Beyond it nothing is sent.',
          value: `${String(ceiling)} emails`,
          changed: ceiling !== 10,
          fixed: false,
          edit: {
            key: CEILING,
            kind: 'number',
            value: ceiling,
            unit: 'emails',
            min: 1,
            max: 1000,
          },
          ...(changedBy === undefined
            ? {}
            : {
                override: {
                  by: changedBy,
                  at: '2026-11-08T09:00:00.000Z',
                  deploymentValue: '10 emails',
                },
              }),
        },
        {
          name: 'Trusted proxies in front of the server',
          explanation: 'How many proxies are trusted.',
          value: '1',
          changed: true,
          fixed: false,
        },
      ],
    },
    {
      title: 'Members and profiles',
      explanation: 'Profile fields.',
      settings: [
        {
          name: 'Longest name',
          explanation: 'Fixed by the database.',
          value: '120 characters',
          changed: false,
          fixed: true,
        },
      ],
    },
  ]
}

function gameGroups(on: boolean): SettingsGroup[] {
  return [
    {
      title: '9toRevolution',
      explanation: 'The office game.',
      settings: [
        {
          name: 'The game',
          explanation: 'On shows the game.',
          value: on ? 'On' : 'Off',
          changed: on,
          fixed: false,
          edit: {
            key: 'game.enabled',
            kind: 'switch',
            value: on ? 1 : 0,
            unit: '',
            min: 0,
            max: 1,
          },
        },
      ],
    },
  ]
}

type Answer = { status: number; body: unknown }

/** Serves the settings and the config, and answers a change or reset with
 * `answer`. */
function server(
  answer: Answer = { status: 200, body: { groups: groups(30, 'Ada Host') } },
  loaded = true,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url === '/api/config')
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ limits: { savedTickMs: 2500 } }),
      })
    if (init?.method !== undefined)
      return Promise.resolve({
        ok: answer.status < 300,
        status: answer.status,
        json: async () => answer.body,
      })
    return Promise.resolve({
      ok: loaded,
      status: loaded ? 200 : 500,
      json: async () => ({ groups: groups() }),
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function mountScreen(): Promise<ReturnType<typeof mount>> {
  const screen = mount(SettingsScreen)
  await flushPromises()
  return screen
}

async function enter(
  screen: ReturnType<typeof mount>,
  value: string,
): Promise<void> {
  await screen.find(`input[id="${CEILING}"]`).setValue(value)
  await screen.find(`input[id="${CEILING}"]`).trigger('change')
  await flushPromises()
}

afterEach(() => {
  vi.unstubAllGlobals()
  session.permissions = ['settings:read', 'settings:manage']
})

describe('SettingsScreen (R-CFG-5, R-CFG-6)', () => {
  it('shows each group with its settings and values, never a variable name', async () => {
    server()
    const screen = await mountScreen()

    expect(screen.findAll('h2').map((h) => h.text())).toEqual([
      'Spam protection',
      'Members and profiles',
    ])
    expect(screen.text()).toContain('Trusted proxies in front of the server')
    expect(screen.text()).not.toMatch(/[A-Z]+_[A-Z_]+/)
  })

  it('gives a changeable setting a field, and the rest plain text', async () => {
    server()
    const screen = await mountScreen()

    const field = screen.find(`input[id="${CEILING}"]`)
    expect((field.element as HTMLInputElement).value).toBe('20')
    expect(field.attributes('min')).toBe('1')
    expect(field.attributes('max')).toBe('1000')
    expect(screen.findAll('input')).toHaveLength(1)
    expect(screen.text()).toContain('Fixed in code')
  })

  it('saves on change and shows the Saved tick (R-PROF-1)', async () => {
    const fetchMock = server()
    const screen = await mountScreen()

    await enter(screen, '30')

    expect(fetchMock).toHaveBeenCalledWith(`/api/admin/settings/${CEILING}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 30 }),
    })
    expect(screen.find('.row [role="status"]').text()).toContain('Saved')
    expect(screen.text()).toContain('Changed by Ada Host')
  })

  it('sends nothing when the value did not change', async () => {
    const fetchMock = server()
    const screen = await mountScreen()

    await enter(screen, '20')

    expect(
      fetchMock.mock.calls.some(
        ([, init]) => (init as RequestInit | undefined)?.method === 'PUT',
      ),
    ).toBe(false)
  })

  it('says what is allowed when a value is out of bounds, and shows no tick', async () => {
    server({ status: 400, body: { error: 'out_of_bounds' } })
    const screen = await mountScreen()

    await enter(screen, '5000')

    expect(screen.find('[role="alert"]').text()).toContain('from 1 to 1,000')
    expect(screen.find('.row [role="status"]').text()).not.toContain('Saved')
  })

  it('refuses a number that is not whole without asking the server', async () => {
    const fetchMock = server()
    const screen = await mountScreen()

    await enter(screen, '2.5')

    expect(screen.find('[role="alert"]').exists()).toBe(true)
    expect(
      fetchMock.mock.calls.some(
        ([, init]) => (init as RequestInit | undefined)?.method === 'PUT',
      ),
    ).toBe(false)
  })

  it('explains a ceiling below its free uses', async () => {
    server({ status: 400, body: { error: 'out_of_order' } })
    const screen = await mountScreen()

    await enter(screen, '2')

    expect(screen.find('[role="alert"]').text()).toContain('not saved')
  })

  it('says so when a change does not save', async () => {
    server({ status: 500, body: {} })
    const screen = await mountScreen()

    await enter(screen, '30')

    expect(screen.find('[role="alert"]').text()).toContain('did not save')
  })

  it('goes back to the deployment’s value', async () => {
    const fetchMock = server({ status: 200, body: { groups: groups() } })
    vi.mocked(fetchMock).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ groups: groups(30, 'Ada Host') }),
      }),
    )
    const screen = await mountScreen()

    await screen.find('button').trigger('click')
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith(`/api/admin/settings/${CEILING}`, {
      method: 'DELETE',
    })
    expect(screen.text()).not.toContain('Changed by')
  })

  it('shows every value as text to a host who cannot change settings', async () => {
    session.permissions = ['settings:read']
    server()
    const screen = await mountScreen()

    expect(screen.findAll('input')).toHaveLength(0)
    expect(screen.text()).toContain('20 emails')
  })

  it('says so when the settings cannot be loaded', async () => {
    server(undefined, false)
    const screen = await mountScreen()

    expect(screen.find('[role="alert"]').text()).toContain(
      'could not be loaded',
    )
  })

  it('turns a switch on by saving 1, and shows it on (R-GAME-17)', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () =>
          url === '/api/config'
            ? { limits: { savedTickMs: 2500 } }
            : { groups: gameGroups(init?.method !== undefined) },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const screen = await mountScreen()
    const toggle = screen.find('input[role="switch"]')

    expect(screen.find('input[type="number"]').exists()).toBe(false)
    await toggle.setValue(true)
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/settings/game.enabled',
      expect.objectContaining({ method: 'PUT', body: '{"value":1}' }),
    )
    expect(screen.text()).toContain('The game: On')
  })

  it('shows the switch as it was when the change does not save', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) =>
        Promise.resolve({
          ok: init?.method === undefined,
          status: init?.method === undefined ? 200 : 500,
          json: async () =>
            url === '/api/config'
              ? { limits: { savedTickMs: 2500 } }
              : { groups: gameGroups(false) },
        }),
      ),
    )
    const screen = await mountScreen()
    const toggle = screen.find('input[role="switch"]')

    await toggle.setValue(true)
    await flushPromises()

    expect((toggle.element as HTMLInputElement).checked).toBe(false)
    expect(screen.find('[role="alert"]').text()).toContain('did not save')
  })
})
