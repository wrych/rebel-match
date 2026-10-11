import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MARK_APART, MARK_OVERLAP, MARK_PHASES, markPose } from './mark'

describe('markPose (R-LOOK-5)', () => {
  it.each([0, 1])('stands at rest at %s', (progress) => {
    expect(markPose(progress)).toEqual({
      offset: MARK_APART,
      lid: 0,
      shut: false,
    })
  })

  it('has the Rs met into the figure once they meet, until the wink ends', () => {
    expect(markPose(MARK_PHASES.meet[1]).offset).toBe(MARK_OVERLAP)
    expect(markPose(MARK_PHASES.wink[1] - 0.001).offset).toBeCloseTo(
      MARK_OVERLAP,
    )
  })

  it('shuts the eye in the middle of the wink, and only then', () => {
    const [from, to] = MARK_PHASES.shut
    const mid = (from + to) / 2

    expect(markPose(mid)).toMatchObject({ lid: 1, shut: true })
    expect(markPose(MARK_PHASES.wink[0]).lid).toBe(0)
    expect(markPose(to).shut).toBe(false)
  })

  it('keeps to the same phases as the page’s keyframes', () => {
    const style = readFileSync('client/components/RebelMark.vue', 'utf8')
    const shares = Object.values(MARK_PHASES).flat()

    for (const share of shares)
      expect(style).toContain(`${String(Math.round(share * 1000) / 10)}%`)
  })
})
