// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyMood, currentMood, savedMood, startMood } from './mood'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
  delete document.documentElement.dataset['mood']
})

describe('mood', () => {
  it('holds no choice until the member makes one', () => {
    expect(savedMood()).toBeNull()
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
    expect(savedMood()).toBeNull()
  })
})

describe('startMood (R-LOOK-6)', () => {
  it('starts in the hosts’ default without storing it as a choice', async () => {
    await startMood(() => Promise.resolve('happy'))

    expect(document.documentElement.dataset['mood']).toBe('happy')
    expect(savedMood()).toBeNull()
  })

  it('keeps the mode this browser chose, whatever the hosts’ default', async () => {
    localStorage.setItem('rm_mood', 'calm')
    const hostsDefault = vi.fn(() => Promise.resolve<'happy'>('happy'))

    await startMood(hostsDefault)

    expect(document.documentElement.dataset['mood']).toBe('calm')
    expect(hostsDefault).not.toHaveBeenCalled()
  })

  it('shows calm while the default is on its way, and when it cannot come', async () => {
    let arrive: (mood: 'happy') => void = () => undefined
    const started = startMood(
      () => new Promise((resolve) => (arrive = resolve)),
    )
    expect(currentMood.value).toBe('calm')
    arrive('happy')
    await started
    expect(currentMood.value).toBe('happy')

    await startMood(() => Promise.reject(new Error('offline')))
    expect(currentMood.value).toBe('calm')
  })

  it('lets a choice made meanwhile win over the default arriving later', async () => {
    let arrive: (mood: 'happy') => void = () => undefined
    const started = startMood(
      () => new Promise((resolve) => (arrive = resolve)),
    )

    applyMood('calm')
    arrive('happy')
    await started

    expect(currentMood.value).toBe('calm')
  })
})
