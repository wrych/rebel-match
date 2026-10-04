// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SettingsScreen from './SettingsScreen.vue'

const permissions = vi.fn<() => string[]>()
vi.mock('../lib/session', () => ({
  loadMe: () => Promise.resolve({ permissions: permissions() }),
}))

const editable = {
  name: 'New applicants per network, at most',
  explanation: 'Past this many, nobody more is recorded.',
  value: '300 applicants',
  envVar: 'APPLICANTS_CEILING',
  changed: false,
  fixed: false,
  editable: {
    key: 'abuse.applicantsCeiling',
    number: 300,
    min: 1,
    max: 100000,
    unit: 'applicants',
  },
}

function groups(override?: object): unknown[] {
  return [
    {
      title: 'Spam protection',
      explanation: 'Limits that stop scripts.',
      settings: [
        { ...editable, ...(override === undefined ? {} : { override }) },
        {
          name: 'Sign-in emails per address, at most',
          explanation: 'Beyond it nothing is sent.',
          value: '20 emails',
          envVar: 'LINK_EMAILS_CEILING',
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

type Reply = { status: number; body: unknown }

/** Routes the screen's requests: config, settings, and the changes. */
function server(replies: { settings?: () => unknown[]; put?: Reply } = {}): {
  calls: { method: string; url: string; body?: string }[]
} {
  const calls: { method: string; url: string; body?: string }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: { method?: string; body?: string }) => {
      const method = init?.method ?? 'GET'
      calls.push({ method, url, ...(init?.body ? { body: init.body } : {}) })
      const reply: Reply =
        url === '/api/config'
          ? { status: 200, body: { limits: { savedTickMs: 2500 } } }
          : method === 'GET'
            ? { status: 200, body: { groups: (replies.settings ?? groups)() } }
            : method === 'PUT'
              ? (replies.put ?? { status: 204, body: null })
              : { status: 204, body: null }
      return Promise.resolve({
        ok: reply.status < 400,
        status: reply.status,
        json: async () => reply.body,
      })
    }),
  )
  return { calls }
}

afterEach(() => {
  vi.unstubAllGlobals()
  permissions.mockReset()
})

describe('SettingsScreen (R-CFG-5)', () => {
  it('shows each group with its settings, values and variables', async () => {
    permissions.mockReturnValue(['settings:read'])
    server()
    const screen = mount(SettingsScreen)
    await flushPromises()

    const headings = screen.findAll('h2').map((h) => h.text())
    expect(headings).toEqual(['Spam protection', 'Members and profiles'])
    expect(screen.text()).toContain('20 emails')
    expect(screen.text()).toContain('LINK_EMAILS_CEILING')
  })

  it('marks a changed value and a value fixed in code', async () => {
    permissions.mockReturnValue(['settings:read'])
    server()
    const screen = mount(SettingsScreen)
    await flushPromises()

    const rows = screen.findAll('.row')
    expect(rows[1]?.text()).toContain('Changed')
    expect(rows[0]?.text()).not.toContain('Changed')
    expect(rows[2]?.text()).toContain('Fixed in code')
  })

  it('offers no field to a host who may only read', async () => {
    permissions.mockReturnValue(['settings:read'])
    server()
    const screen = mount(SettingsScreen)
    await flushPromises()

    expect(screen.find('input').exists()).toBe(false)
    expect(screen.text()).toContain('300 applicants')
  })

  it('says so when the settings cannot be loaded', async () => {
    permissions.mockReturnValue(['settings:read'])
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
    )
    const screen = mount(SettingsScreen)
    await flushPromises()

    expect(screen.find('[role="alert"]').text()).toContain(
      'could not be loaded',
    )
  })
})

describe('SettingsScreen, changing values (R-CFG-6)', () => {
  it('saves a changed value when the field is left, with a tick', async () => {
    permissions.mockReturnValue(['settings:read', 'settings:manage'])
    const { calls } = server()
    const screen = mount(SettingsScreen)
    await flushPromises()

    const field = screen.find('input#setting-abuse\\.applicantsCeiling')
    await field.setValue('500')
    await field.trigger('change')
    await flushPromises()

    expect(calls).toContainEqual({
      method: 'PUT',
      url: '/api/admin/settings/abuse.applicantsCeiling',
      body: JSON.stringify({ value: 500 }),
    })
    expect(screen.text()).toContain('Saved')
  })

  it('explains a refused value', async () => {
    permissions.mockReturnValue(['settings:manage'])
    server({ put: { status: 400, body: { error: 'out_of_order' } } })
    const screen = mount(SettingsScreen)
    await flushPromises()

    const field = screen.find('input#setting-abuse\\.applicantsCeiling')
    await field.setValue('5')
    await field.trigger('change')
    await flushPromises()

    expect(screen.find('[role="alert"]').text()).toContain('cannot be more')
  })

  it('shows who changed a value and goes back to the deployment value', async () => {
    permissions.mockReturnValue(['settings:manage'])
    const { calls } = server({
      settings: () =>
        groups({
          by: 'Ada Admin',
          at: '2026-10-04T19:00:00Z',
          deploymentValue: '300 applicants',
        }),
    })
    const screen = mount(SettingsScreen)
    await flushPromises()

    expect(screen.text()).toContain('Changed in the app by Ada Admin')
    expect(screen.text()).toContain('The deployment would use 300 applicants')

    await screen.find('button.reset').trigger('click')
    await flushPromises()

    expect(calls).toContainEqual({
      method: 'DELETE',
      url: '/api/admin/settings/abuse.applicantsCeiling',
    })
  })
})
