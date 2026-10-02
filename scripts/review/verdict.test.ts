import { describe, expect, it } from 'vitest'
import config from './config.json' with { type: 'json' }
import {
  findingsSchema,
  formatFinding,
  judge,
  type Finding,
  type ReviewConfig,
} from './verdict.js'

const review: ReviewConfig = config

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    category: 'style',
    rule: 'constitution §3',
    file: 'src/app.ts',
    line: 10,
    summary: 'a comment restates the code',
    failure: 'a reader is told what the next line already says',
    ...overrides,
  }
}

describe('judge', () => {
  it('passes a push with nothing to report', () => {
    expect(judge([], review)).toEqual({
      blocked: false,
      blocking: [],
      advisory: [],
    })
  })

  it('lets findings below the threshold through as advice', () => {
    const verdict = judge(
      [finding(), finding({ category: 'design-rule' })],
      review,
    )

    expect(verdict.blocked).toBe(false)
    expect(verdict.advisory.map((f) => f.score)).toEqual([3, 1])
  })

  it('blocks at the threshold: a spec contradiction scores 4', () => {
    const verdict = judge([finding({ category: 'spec-contradiction' })], review)

    expect(verdict.blocked).toBe(true)
    expect(verdict.blocking[0]?.score).toBe(4)
  })

  it('blocks a privacy finding and lists blockers worst first', () => {
    const verdict = judge(
      [
        finding({ category: 'correctness' }),
        finding({ category: 'privacy-security' }),
        finding(),
      ],
      review,
    )

    expect(verdict.blocking.map((f) => f.score)).toEqual([7, 6])
    expect(verdict.advisory).toHaveLength(1)
  })

  it.each([
    { file: ' ' },
    { line: 0 },
    { rule: '' },
    { failure: '' },
    { category: 'vibes' },
  ])('drops an unbacked finding %j rather than block on it', (gap) => {
    const verdict = judge(
      [finding({ category: 'privacy-security', ...gap })],
      review,
    )

    expect(verdict).toEqual({ blocked: false, blocking: [], advisory: [] })
  })
})

describe('findingsSchema', () => {
  it('offers exactly the configured categories', () => {
    const schema = JSON.stringify(findingsSchema(review))

    for (const category of Object.keys(review.categories)) {
      expect(schema).toContain(`"${category}"`)
    }
  })
})

describe('formatFinding', () => {
  it('names the score, location, rule and failure', () => {
    const [scored] = judge([finding()], review).advisory

    expect(formatFinding(scored!, review)).toBe(
      '  [1/7 style] src/app.ts:10 — a comment restates the code\n' +
        '      rule: constitution §3\n' +
        '      fails when: a reader is told what the next line already says',
    )
  })

  it('scores out of the highest configured score, not a fixed one', () => {
    const wider = { ...review, categories: { ...review.categories, x: 9 } }
    const [scored] = judge([finding()], wider).advisory

    expect(formatFinding(scored!, wider)).toMatch(/^ {2}\[1\/9 style\]/)
  })
})
