// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SettingsScreen from './SettingsScreen.vue'

const groups = [
  {
    title: 'Spam protection',
    explanation: 'Limits that stop scripts.',
    settings: [
      {
        name: 'Sign-in emails per address, at most',
        explanation: 'Beyond it nothing is sent.',
        value: '20 emails',
        envVar: 'LINK_EMAILS_CEILING',
        changed: true,
        fixed: false,
      },
      {
        name: 'Sign-in emails per address, sent freely',
        explanation: 'Without any check.',
        value: '3 emails',
        envVar: 'LINK_EMAILS_BEFORE_CHECK',
        changed: false,
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

function respond(ok: boolean): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok,
      status: ok ? 200 : 500,
      json: async () => ({ groups }),
    }),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SettingsScreen (R-CFG-5)', () => {
  it('shows each group with its settings, values and variables', async () => {
    respond(true)
    const screen = mount(SettingsScreen)
    await flushPromises()

    const headings = screen.findAll('h2').map((h) => h.text())
    expect(headings).toEqual(['Spam protection', 'Members and profiles'])
    expect(screen.text()).toContain('20 emails')
    expect(screen.text()).toContain('LINK_EMAILS_CEILING')
  })

  it('marks a changed value and a value fixed in code', async () => {
    respond(true)
    const screen = mount(SettingsScreen)
    await flushPromises()

    const rows = screen.findAll('.row')
    expect(rows[0]?.text()).toContain('Changed')
    expect(rows[1]?.text()).not.toContain('Changed')
    expect(rows[2]?.text()).toContain('Fixed in code')
  })

  it('says so when the settings cannot be loaded', async () => {
    respond(false)
    const screen = mount(SettingsScreen)
    await flushPromises()

    expect(screen.find('[role="alert"]').text()).toContain(
      'could not be loaded',
    )
  })
})
