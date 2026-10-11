// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyMood, currentMood, savedMood } from './mood'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
  delete document.documentElement.dataset['mood']
})

describe('mood', () => {
  it('starts calm', () => {
    expect(savedMood()).toBe('calm')
  })

  it('shows and remembers happy mode', () => {
    applyMood('happy')

    expect(document.documentElement.dataset['mood']).toBe('happy')
    expect(currentMood.value).toBe('happy')
    expect(savedMood()).toBe('happy')
  })

  it('shows the mark in its colours in the browser tab (R-LOOK-5)', () => {
    const icon = document.createElement('link')
    icon.rel = 'icon'
    icon.href = '/favicon.svg'
    document.head.append(icon)

    applyMood('happy')
    expect(icon.getAttribute('href')).toBe('/favicon-happy.svg')
    applyMood('calm')
    expect(icon.getAttribute('href')).toBe('/favicon.svg')

    icon.remove()
  })

  it('still switches when the browser refuses storage', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })

    applyMood('happy')

    expect(document.documentElement.dataset['mood']).toBe('happy')
    expect(savedMood()).toBe('calm')
  })
})
