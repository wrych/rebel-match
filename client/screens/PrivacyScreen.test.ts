// @vitest-environment jsdom
import { mount, RouterLinkStub } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PrivacyScreen from './PrivacyScreen.vue'
import TermsScreen from './TermsScreen.vue'

function show(screen: typeof PrivacyScreen): ReturnType<typeof mount> {
  return mount(screen, { global: { stubs: { RouterLink: RouterLinkStub } } })
}

describe('PrivacyScreen', () => {
  it('shows the notice from docs/legal with its version (R-ONB-9)', () => {
    const screen = show(PrivacyScreen)
    expect(screen.find('h1').text()).toBe('Privacy notice')
    expect(screen.find('time').attributes('datetime')).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    )
    expect(screen.text()).toContain('Transformation Architects GmbH')
  })

  it('links the controller address as an email', () => {
    const screen = show(PrivacyScreen)
    expect(
      screen
        .find('a[href="mailto:ready@transformation-architects.ch"]')
        .exists(),
    ).toBe(true)
  })

  it('links the terms of use (R-ONB-13)', () => {
    const link = show(PrivacyScreen).findComponent(RouterLinkStub)
    expect(link.props('to')).toBe('/terms')
  })
})

describe('TermsScreen', () => {
  it('shows the terms from docs/legal with its version (R-ONB-13)', () => {
    const screen = show(TermsScreen)
    expect(screen.find('h1').text()).toBe('Terms of use')
    expect(screen.find('time').exists()).toBe(true)
    expect(screen.findAll('h2').map((h) => h.text())).toContain('9. Liability')
  })

  it('links the privacy notice', () => {
    const link = show(TermsScreen).findComponent(RouterLinkStub)
    expect(link.props('to')).toBe('/privacy')
  })
})
