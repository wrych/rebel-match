// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import NetworkCallout from './NetworkCallout.vue'

const stats = {
  connections: 3,
  hidden: false,
  challenges: 2,
  joined: '2026-11-08',
}

function callout(
  props: Partial<{
    name: string | null
    x: number
    y: number
    hidden: boolean
  }> = {},
): ReturnType<typeof mount> {
  return mount(NetworkCallout, {
    props: {
      name: props.name === undefined ? 'Ada Lovelace' : props.name,
      stats: { ...stats, hidden: props.hidden ?? false },
      at: { x: props.x ?? 50, y: props.y ?? 300 },
      stage: { width: 400, height: 500 },
    },
  })
}

describe('NetworkCallout (R-NET-14)', () => {
  it('names the member and gives their figures', () => {
    const shown = callout()
    const rows = shown
      .findAll('dl div')
      .map((row) => [row.find('dt').text(), row.find('dd').text()])

    expect(shown.find('.who').text()).toBe('Ada Lovelace')
    expect(rows).toEqual([
      ['Connections', '3'],
      ['Challenges', '2'],
    ])
    expect(shown.find('.joined').text()).toBe('Joined 2026-11-08')
  })

  it('stars connections left out, for the footnote below (R-NET-13)', () => {
    expect(callout({ hidden: true }).find('dd').text()).toBe('3*')
  })

  it('says you when there is no name', () => {
    expect(callout({ name: null }).find('.who').text()).toBe('You')
  })

  it('keeps the card within the stage’s sides', () => {
    const left = (x: number): number =>
      Number.parseFloat(
        (callout({ x }).find('.card').element as HTMLElement).style.left,
      )

    expect(4 + left(4)).toBe(8)
    expect(left(200)).toBe(0)
  })

  it('opens downwards in the upper part of the stage', () => {
    expect(callout({ y: 300 }).classes()).not.toContain('below')
    expect(callout({ y: 120 }).classes()).toContain('below')
  })
})
