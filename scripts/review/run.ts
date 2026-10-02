import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import config from './config.json' with { type: 'json' }
import {
  findingsSchema,
  formatFinding,
  judge,
  type Finding,
  type ReviewConfig,
} from './verdict.js'
import { readOutput, type ReviewerResult } from './output.js'

const AGENT_FILE = '.claude/agents/reviewer.md'
const MAX_REVIEWER_OUTPUT_BYTES = 64 * 1024 * 1024
const CACHE_BASE_CHARS = 12
const CACHE_KEY_CHARS = 24
const REVIEWER_TOOLS = [
  'Read',
  'Grep',
  'Glob',
  'Bash(git diff:*)',
  'Bash(git log:*)',
  'Bash(git show:*)',
]

function say(text: string): void {
  process.stderr.write(`${text}\n`)
}

function git(...args: string[]): string {
  const result = spawnSync('git', args, { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`git ${args[0] ?? ''} failed`)
  return result.stdout.trim()
}

function cachePath(base: string, diff: string): string {
  const key = createHash('sha256')
    .update(diff)
    .update(readFileSync(AGENT_FILE))
    .update(JSON.stringify(config))
    .digest('hex')
  const dir = git('rev-parse', '--git-path', 'review-cache')
  mkdirSync(dir, { recursive: true })
  const name = `${base.slice(0, CACHE_BASE_CHARS)}-${key.slice(0, CACHE_KEY_CHARS)}`
  return join(dir, `${name}.json`)
}

function askReviewer(base: string, review: ReviewConfig): ReviewerResult {
  const prompt =
    `Review the change \`git diff ${base}...HEAD\` ` +
    `(commits: \`git log ${base}..HEAD\`). Report findings as instructed.`
  const result = spawnSync(
    'claude',
    [
      ...['-p', prompt, '--agent', 'reviewer'],
      ...['--output-format', 'json', '--no-session-persistence'],
      ...['--json-schema', JSON.stringify(findingsSchema(review))],
      ...['--permission-mode', 'dontAsk', '--allowedTools', ...REVIEWER_TOOLS],
    ],
    { encoding: 'utf8', maxBuffer: MAX_REVIEWER_OUTPUT_BYTES },
  )
  if (result.error !== undefined) return { failure: result.error.message }
  if (result.status !== 0) {
    return { failure: `claude exited with ${String(result.status)}` }
  }
  return readOutput(result.stdout)
}

function reviewerAvailable(): boolean {
  return spawnSync('claude', ['--version']).status === 0
}

function findingsFor(base: string, diff: string): ReviewerResult {
  const cache = cachePath(base, diff)
  if (existsSync(cache)) {
    say('review: unchanged since the last review, reusing its verdict')
    return { findings: JSON.parse(readFileSync(cache, 'utf8')) as Finding[] }
  }

  say('review: asking the reviewer agent (this takes a minute or two)…')
  const result = askReviewer(base, config)
  if ('findings' in result)
    writeFileSync(cache, JSON.stringify(result.findings))
  return result
}

function report(findings: Finding[]): number {
  const verdict = judge(findings, config)
  for (const finding of verdict.advisory) say(formatFinding(finding, config))

  if (!verdict.blocked) {
    say(`review: passed (${String(verdict.advisory.length)} advisory)`)
    return 0
  }

  say(`\nreview: blocked — findings scoring ${String(config.threshold)}+:`)
  for (const finding of verdict.blocking) say(formatFinding(finding, config))
  say('\nFix them, or answer them in the PR. Do not bypass with --no-verify.')
  return 1
}

function main(): number {
  const base = git(
    'merge-base',
    'HEAD',
    process.env['REVIEW_BASE'] ?? 'origin/main',
  )
  const diff = git('diff', '--no-color', `${base}...HEAD`)
  if (diff === '') return 0

  if (!reviewerAvailable()) {
    say('review: SKIPPED — the `claude` CLI is not installed or not on PATH')
    return 0
  }

  const result = findingsFor(base, diff)
  if ('failure' in result) {
    say(
      `review: SKIPPED — the reviewer failed (${result.failure}); push allowed`,
    )
    return 0
  }
  return report(result.findings)
}

process.exitCode = main()
