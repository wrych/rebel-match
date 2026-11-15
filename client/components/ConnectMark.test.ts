// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ConnectMark from './ConnectMark.vue'

const hosts = vi.hoisted(() => ({ connectMark: 1 }))

vi.mock('../lib/config', async (original) => ({
  ...(await original<typeof import('../lib/config')>()),
  sharedConfig: async () => ({ limits: { connectMark: hosts.connectMark } }),
}))

function stubMotion(reduced: boolean): void {
  vi.stubGlobal('matchMedia', () => ({ matches: reduced }))
}

async function connectButton(disabled = false): Promise<VueWrapper> {
  const button = mount(
    defineComponent({
      components: { ConnectMark },
      setup: () => ({ disabled }),
      template:
        '<button type="button" :disabled="disabled"><ConnectMark />Accept</button>',
    }),
    { attachTo: document.body },
  )
  await flushPromises()
  return button
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
  hosts.connectMark = 1
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('ConnectMark (R-LOOK-7)', () => {
  it('rests until its button is hovered', async () => {
    stubMotion(false)
    const button = await connectButton()

    expect(playing(button)).toBe(false)
    await fire(button, 'pointerenter')
    expect(playing(button)).toBe(true)
  })

  it('keeps playing round after round while hovered', async () => {
    stubMotion(false)
    const button = await connectButton()

    await fire(button, 'pointerenter')
    await endRound(button)

    expect(playing(button)).toBe(true)
  })

  it('finishes the round it is in once the pointer leaves', async () => {
    stubMotion(false)
    const button = await connectButton()

    await fire(button, 'pointerenter')
    await fire(button, 'pointerleave')
    expect(playing(button)).toBe(true)

    await endRound(button)
    expect(playing(button)).toBe(false)
  })

  it('plays while pressed and stops after the press', async () => {
    stubMotion(false)
    const button = await connectButton()

    await fire(button, 'pointerdown')
    await endRound(button)
    expect(playing(button)).toBe(true)

    await fire(button, 'pointerup')
    await endRound(button)
    expect(playing(button)).toBe(false)
  })

  it('plays a round when pressed from the keyboard', async () => {
    stubMotion(false)
    const button = await connectButton()

    button.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }))
    await nextTick()
    expect(playing(button)).toBe(false)

    button.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    await nextTick()
    expect(playing(button)).toBe(true)
  })

  it('stays at rest on a disabled button', async () => {
    stubMotion(false)
    const button = await connectButton(true)

    await fire(button, 'pointerenter')

    expect(playing(button)).toBe(false)
  })

  it('comes to rest when its button is disabled mid-play', async () => {
    stubMotion(false)
    const button = await connectButton()

    await fire(button, 'pointerenter')
    button.element.setAttribute('disabled', '')
    await endRound(button)

    expect(playing(button)).toBe(false)
  })

  it('is not drawn while the hosts have switched it off', async () => {
    stubMotion(false)
    hosts.connectMark = 0
    const button = await connectButton()

    expect(button.find('.connect-mark').exists()).toBe(false)
    expect(button.text()).toBe('Accept')
  })

  it('never plays for a member who prefers reduced motion', async () => {
    stubMotion(true)
    const button = await connectButton()

    await fire(button, 'pointerenter')
    await fire(button, 'pointerdown')

    expect(playing(button)).toBe(false)
  })
})
