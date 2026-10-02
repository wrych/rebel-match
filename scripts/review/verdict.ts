/** How a review is configured: the score that blocks a push, and the fixed
 * score of each rule category. The reviewer picks a category, never a score. */
export interface ReviewConfig {
  threshold: number
  categories: Record<string, number>
}

/** One finding as the reviewer reports it. */
export interface Finding {
  category: string
  rule: string
  file: string
  line: number
  summary: string
  failure: string
}

export interface ScoredFinding extends Finding {
  score: number
}

export interface Verdict {
  blocked: boolean
  blocking: ScoredFinding[]
  advisory: ScoredFinding[]
}

function isEvidenced(finding: Finding): boolean {
  return (
    finding.file.trim() !== '' &&
    finding.line > 0 &&
    finding.rule.trim() !== '' &&
    finding.failure.trim() !== ''
  )
}

/** Scores findings by category and splits them at the threshold. A finding
 * with no location, rule or failure scenario, or an unknown category, is
 * dropped: an unbacked claim never blocks a push. */
export function judge(
  findings: readonly Finding[],
  config: ReviewConfig,
): Verdict {
  const scored = findings
    .filter(isEvidenced)
    .flatMap((finding) => {
      const score = config.categories[finding.category]
      return score === undefined ? [] : [{ ...finding, score }]
    })
    .sort((a, b) => b.score - a.score)

  const blocking = scored.filter((f) => f.score >= config.threshold)
  const advisory = scored.filter((f) => f.score < config.threshold)

  return { blocked: blocking.length > 0, blocking, advisory }
}

/** The JSON Schema the reviewer's structured output must satisfy, with the
 * categories taken from config so the two cannot drift. */
export function findingsSchema(config: ReviewConfig): object {
  const text = { type: 'string' }
  return {
    type: 'object',
    properties: {
      findings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            category: { type: 'string', enum: Object.keys(config.categories) },
            rule: text,
            file: text,
            line: { type: 'integer' },
            summary: text,
            failure: text,
          },
          required: ['category', 'rule', 'file', 'line', 'summary', 'failure'],
        },
      },
    },
    required: ['findings'],
  }
}

/** One finding as a line a developer can act on, scored out of the highest
 * score the config can give. */
export function formatFinding(
  finding: ScoredFinding,
  config: ReviewConfig,
): string {
  const top = Math.max(...Object.values(config.categories))
  return (
    `  [${String(finding.score)}/${String(top)} ${finding.category}] ` +
    `${finding.file}:${String(finding.line)} — ${finding.summary}\n` +
    `      rule: ${finding.rule}\n` +
    `      fails when: ${finding.failure}`
  )
}
