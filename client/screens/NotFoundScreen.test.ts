// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import NotFoundScreen from './NotFoundScreen.vue'

describe('NotFoundScreen', () => {
  it('never hints that the thing exists but is forbidden (R-NAV-8)', () => {
    const text = mount(NotFoundScreen, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    }).text()

    for (const word of ['forbidden', 'permission', 'not allowed', 'denied']) {
      expect(text.toLowerCase()).not.toContain(word)
    }
  })
})
