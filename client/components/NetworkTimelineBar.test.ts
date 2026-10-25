// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { NetworkTimeline } from '../../src/network/timeline'
import NetworkTimelineBar from './NetworkTimelineBar.vue'

const timeline: NetworkTimeline = {
  nodes: [
    { id: 0, at: 0, day: '2026-10-01', self: false },
    { id: 1, at: 0.4, day: '2026-10-03', self: true },
  ],
  links: [{ source: 0, target: 1, at: 1, day: '2026-11-08' }],
}

const bar = (progress: number, day: string | null): ReturnType<typeof mount> =>
  mount(NetworkTimelineBar, { props: { timeline, progress, day } })

describe('NetworkTimelineBar', () => {
  it('marks each join and connection where it plays', () => {
    const ticks = bar(0, null)
      .findAll('.tick')
      .map((tick) => [tick.classes('tick-node'), tick.attributes('x1')])

    expect(ticks).toEqual([
      [false, '1000'],
      [true, '0'],
      [true, '400'],
    ])
  })

  it('shows where the replay is, and the day it has reached', () => {
    const shown = bar(0.25, '2026-10-02')

    expect(shown.find('.playhead').attributes('x1')).toBe('250')
    expect(shown.find('.now').text()).toBe('2 October 2026')
    expect(shown.find('input').attributes('aria-valuetext')).toBe(
      '2 October 2026',
    )
  })

  it('names the first and last day', () => {
    expect(bar(0, null).find('.ends').text()).toBe(
      '1 October 20268 November 2026',
    )
  })

  it('asks to go where the member drags it', async () => {
    const shown = bar(0, null)

    await shown.find('input').setValue('640')

    expect(shown.emitted('seek')).toEqual([[0.64]])
  })
})
