// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { applyMood } from '../lib/mood'
import ColourModeSetting from './ColourModeSetting.vue'

afterEach(() => {
  applyMood('calm')
  localStorage.clear()
  delete document.documentElement.dataset['mood']
})

describe('ColourModeSetting (R-LOOK-2)', () => {
  it('is a switch showing the mode on now', () => {
    applyMood('happy')
    const setting = mount(ColourModeSetting, { props: { tickMs: 1000 } })

    const toggle = setting.find('input[role="switch"]')
    expect((toggle.element as HTMLInputElement).checked).toBe(true)
  })

  it('switches happy mode on and off, remembered, with a tick', async () => {
    const setting = mount(ColourModeSetting, { props: { tickMs: 1000 } })
    const toggle = setting.find('input[role="switch"]')

    await toggle.setValue(true)
    expect(document.documentElement.dataset['mood']).toBe('happy')
    expect(localStorage.getItem('rm_mood')).toBe('happy')
    expect(setting.find('[role="status"]').text()).toContain('Saved')

    await toggle.setValue(false)
    expect(document.documentElement.dataset['mood']).toBe('calm')
  })
})
