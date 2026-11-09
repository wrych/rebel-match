// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import CodeIcon from './CodeIcon.vue'

describe('CodeIcon (R-CODE-1)', () => {
  it('is a QR mark hidden from assistive technology', () => {
    const icon = mount(CodeIcon)

    expect(icon.attributes('aria-hidden')).toBe('true')
    expect(icon.find('.spinner').exists()).toBe(false)
  })

  it('wears the spinning ring in its corner when live (R-CODE-5)', () => {
    expect(
      mount(CodeIcon, { props: { live: true } })
        .find('.spinner')
        .exists(),
    ).toBe(true)
  })
})
