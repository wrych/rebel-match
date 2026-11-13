// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ConnectMark from './ConnectMark.vue'

function stubMotion(reduced: boolean): void {
  vi.stubGlobal('matchMedia', () => ({ matches: reduced }))
}

function connectButton(disabled = false): VueWrapper {
  return mount(
    defineComponent({
      components: { ConnectMark },
      setup: () => ({ disabled }),
      template:
        '<button type="button" :disabled="disabled"><ConnectMark />Accept</button>',
    }),
    { attachTo: document.body },
  )
}

async function fire(wrapper: VueWrapper, type: string): Promise<void> {
  wrapper.element.dispatchEvent(new Event(type))
  await nextTick()
}

async function endRound(wrapper: VueWrapper): Promise<void> {
  await wrapper.find('.connect-mark').trigger('animationiteration')
}

const playing = (wrapper: VueWrapper): boolean =>
  wrapper.find('.rebel-mark').classes('rebel-mark-repeat')

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('ConnectMark (R-LOOK-7)', () => {
  it('rests until its button is hovered', async () => {
    stubMotion(false)
    const button = connectButton()

    expect(playing(button)).toBe(false)
    await fire(button, 'pointerenter')
    expect(playing(button)).toBe(true)
  })

  it('keeps playing round after round while hovered', async () => {
    stubMotion(false)
    const button = connectButton()

    await fire(button, 'pointerenter')
    await endRound(button)

    expect(playing(button)).toBe(true)
  })

  it('finishes the round it is in once the pointer leaves', async () => {
    stubMotion(false)
    const button = connectButton()

    await fire(button, 'pointerenter')
    await fire(button, 'pointerleave')
    expect(playing(button)).toBe(true)

    await endRound(button)
    expect(playing(button)).toBe(false)
  })

  it('plays while pressed and stops after the press', async () => {
    stubMotion(false)
    const button = connectButton()

    await fire(button, 'pointerdown')
    await endRound(button)
    expect(playing(button)).toBe(true)

    await fire(button, 'pointerup')
    await endRound(button)
    expect(playing(button)).toBe(false)
  })

  it('plays a round when pressed from the keyboard', async () => {
    stubMotion(false)
    const button = connectButton()

    button.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }))
    await nextTick()
    expect(playing(button)).toBe(false)

    button.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    await nextTick()
    expect(playing(button)).toBe(true)
  })

  it('stays at rest on a disabled button', async () => {
    stubMotion(false)
    const button = connectButton(true)

    await fire(button, 'pointerenter')

    expect(playing(button)).toBe(false)
  })

  it('never plays for a member who prefers reduced motion', async () => {
    stubMotion(true)
    const button = connectButton()

    await fire(button, 'pointerenter')
    await fire(button, 'pointerdown')

    expect(playing(button)).toBe(false)
  })
})
