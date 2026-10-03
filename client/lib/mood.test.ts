// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyMood, savedMood } from './mood'

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
    expect(savedMood()).toBe('happy')
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
