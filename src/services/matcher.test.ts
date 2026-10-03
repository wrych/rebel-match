import { describe, expect, it } from 'vitest'
import { trends } from '../seed/shared/trends.js'
import { challenges } from '../seed/dev/challenges.js'
import { FALLBACK_TREND, detectTrend } from './matcher.js'

describe('detectTrend', () => {
  it.each([
    ['Nobody knows who can actually decide what since we flattened.', '06'],
    ['Our salary model still reflects the old hierarchy.', '07'],
    [
      'We want to replace the annual performance review with peer feedback.',
      '08',
    ],
    ['Every experiment dies in the annual budget cycle.', '04'],
    ['Leadership asked everyone back for three fixed office days.', '05'],
    ['A shadow organisation runs beside the official org chart.', '02'],
    ['Our purpose statement means nothing on the shop floor.', '01'],
    [
      'Managers still micromanage after the reorg of management positions.',
      '03',
    ],
  ])('reads %j as trend %s (R-ASK-5)', (text, trend) => {
    expect(detectTrend(text, trends)).toBe(trend)
  })

  it('falls back to Distributed Decision Making when nothing scores (design §5)', () => {
    expect(detectTrend('Lunch is late again.', trends)).toBe(FALLBACK_TREND)
    expect(FALLBACK_TREND).toBe('06')
  })

  it('ignores case', () => {
    expect(detectTrend('SALARY TRANSPARENCY', trends)).toBe('07')
  })

  it('weighs one strong keyword over several weak ones', () => {
    const custom = [
      { id: 'A', keywords: { strong: [], weak: ['team', 'plan', 'boss'] } },
      { id: 'B', keywords: { strong: ['okr'], weak: [] } },
    ]

    expect(detectTrend('team plan boss okr', custom)).toBe('B')
  })

  it('keeps the earlier trend on a tie', () => {
    const custom = [
      { id: 'A', keywords: { strong: ['x'], weak: [] } },
      { id: 'B', keywords: { strong: ['x'], weak: [] } },
    ]

    expect(detectTrend('x', custom)).toBe('A')
  })

  it('agrees with the trend the prototype gave most seeded challenges', () => {
    const agreed = challenges.filter(
      (c) => detectTrend(c.body, trends) === c.trendId,
    )

    expect(agreed.length / challenges.length).toBeGreaterThan(0.6)
  })
})
