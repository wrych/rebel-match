// @vitest-environment jsdom
import { mount, RouterLinkStub } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import NotFoundScreen from './NotFoundScreen.vue'

function screen(): ReturnType<typeof mount> {
  return mount(NotFoundScreen, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
}

describe('NotFoundScreen', () => {
  it('never hints that the thing exists but is forbidden (R-NAV-8)', () => {
    const text = screen().text()

    for (const word of ['forbidden', 'permission', 'not allowed', 'denied']) {
      expect(text.toLowerCase()).not.toContain(word)
    }
  })

  it('links to the feedback form, saying where it came from (R-FB-1)', () => {
    const links = screen()
      .findAllComponents(RouterLinkStub)
      .map((link) => link.props('to') as unknown)

    expect(links).toContain('/feedback?from=not-found')
  })
})
