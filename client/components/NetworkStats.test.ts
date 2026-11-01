// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import NetworkStats from './NetworkStats.vue'

const stats = (frame: object): ReturnType<typeof mount> =>
  mount(NetworkStats, {
    props: {
      frame: {
        progress: 0.5,
        nodes: 0,
        links: 0,
        moons: 0,
        day: null,
        ...frame,
      },
    },
  })

describe('NetworkStats (R-NET-12)', () => {
  it('shows the day reached and what shows by then', () => {
    const shown = stats({ nodes: 42, links: 17, moons: 9, day: '2026-11-08' })
    const rows = shown
      .findAll('dl div')
      .map((row) => [row.find('dt').text(), row.find('dd').text()])

    expect(shown.find('.when').text()).toBe('8 November 2026')
    expect(rows).toEqual([
      ['Members', '42'],
      ['Connections', '17'],
      ['Challenges', '9'],
    ])
  })

  it('shows no day before anything has appeared', () => {
    expect(stats({}).find('.when').text()).toBe('')
  })
})
