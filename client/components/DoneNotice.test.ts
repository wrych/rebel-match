// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import DoneNotice from './DoneNotice.vue'

describe('DoneNotice', () => {
  it('announces what worked as a status', () => {
    const notice = mount(DoneNotice, {
      slots: { default: '<strong>Profile saved.</strong>' },
    })
    expect(notice.find('[role="status"]').text()).toContain('Profile saved.')
  })

  it('keeps the tick from being read out', () => {
    const notice = mount(DoneNotice, { slots: { default: 'Saved.' } })
    expect(notice.find('.tick').attributes('aria-hidden')).toBe('true')
  })
})
