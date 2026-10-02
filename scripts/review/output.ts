import type { Finding } from './verdict.js'

/** What one reviewer run produced: findings, or why there are none. */
export type ReviewerResult = { findings: Finding[] } | { failure: string }

interface ClaudeOutput {
  is_error?: boolean
  result?: string
  structured_output?: { findings?: Finding[] }
}

/** Reads `claude -p --output-format json` output. Anything but structured
 * findings is a failure with a reason, never an empty pass. */
export function readOutput(stdout: string): ReviewerResult {
  let output: ClaudeOutput
  try {
    output = JSON.parse(stdout) as ClaudeOutput
  } catch {
    return { failure: 'its output was not JSON' }
  }
  if (output.is_error === true) {
    return { failure: `it reported an error: ${output.result ?? 'unknown'}` }
  }
  const findings = output.structured_output?.findings
  return findings === undefined
    ? { failure: 'it returned no structured findings' }
    : { findings }
}
