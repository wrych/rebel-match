// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import RefreshButton from './RefreshButton.vue'

describe('RefreshButton (R-NAV-12)', () => {
  it('refreshes the list when pressed', async () => {
    const live = reactive({ refreshing: false, pullPx: 70, refresh: vi.fn() })
    const button = mount(RefreshButton, { props: { live } })

    await button.find('button').trigger('click')

    expect(live.refresh).toHaveBeenCalledOnce()
  })

  it('waits while a refresh runs', async () => {
    const live = reactive({ refreshing: true, pullPx: 70, refresh: vi.fn() })
    const button = mount(RefreshButton, { props: { live } })

    expect(button.find('button').attributes('aria-label')).toBe('Refreshing')
    expect(button.find('button').attributes('disabled')).toBeDefined()
  })
})
