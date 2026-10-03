// @vitest-environment jsdom
import { mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import App from './App.vue'

function mountApp(): ReturnType<typeof mount> {
  return mount(App, {
    global: {
      stubs: { RouterLink: RouterLinkStub, RouterView: true, TabBar: true },
    },
  })
}

afterEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset['mood']
})

describe('App shell', () => {
  it('carries the Corporate Rebels mark home', () => {
    const app = mountApp()

    expect(app.find('img').attributes('alt')).toBe('Corporate Rebels')
    expect(app.findComponent(RouterLinkStub).props('to')).toBe('/')
  })

  it('switches happy mode on and off, saying which it is', async () => {
    const app = mountApp()
    const cap = app.find('button.cap')

    expect(cap.attributes('aria-pressed')).toBe('false')
    await cap.trigger('click')
    expect(document.documentElement.dataset['mood']).toBe('happy')
    expect(cap.attributes('aria-pressed')).toBe('true')
    await cap.trigger('click')
    expect(document.documentElement.dataset['mood']).toBe('calm')
  })

  it('opens in the mode this browser chose last', () => {
    localStorage.setItem('rm_mood', 'happy')

    mountApp()

    expect(document.documentElement.dataset['mood']).toBe('happy')
  })
})
