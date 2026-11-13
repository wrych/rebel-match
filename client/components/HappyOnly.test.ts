// @vitest-environment jsdom
import { mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { currentMood } from '../lib/mood'
import HappyOnly from './HappyOnly.vue'

function mountInMood(mood: 'calm' | 'happy'): ReturnType<typeof mount> {
  currentMood.value = mood
  return mount(HappyOnly, {
    slots: { default: '<p class="game">The game</p>' },
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
}

afterEach(() => {
  currentMood.value = 'calm'
})

describe('HappyOnly', () => {
  it('links back to About & legal in calm mode, hiding the game (R-GAME-1)', () => {
    const screen = mountInMood('calm')
    const link = screen.findComponent(RouterLinkStub)

    expect(screen.find('.game').exists()).toBe(false)
    expect(screen.text()).toContain('only come out in happy mode')
    expect(link.props('to')).toBe('/about')
    expect(link.text()).toBe('Back to About & legal')
  })

  it('shows what it wraps in happy mode (R-GAME-1)', () => {
    const screen = mountInMood('happy')

    expect(screen.find('.game').exists()).toBe(true)
    expect(screen.findComponent(RouterLinkStub).exists()).toBe(false)
  })
})
