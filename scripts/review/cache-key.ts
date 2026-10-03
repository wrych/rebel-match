import { createHash } from 'node:crypto'

/** What a cached verdict was given. The commits count as much as the diff:
 * the reviewer judges how a change is split (constitution §1), so the same
 * diff in different commits is a different change to review. */
export interface ReviewInput {
  diff: string
  commits: string
  agent: string
  config: unknown
}

export function cacheKey(input: ReviewInput): string {
  return createHash('sha256')
    .update(input.diff)
    .update('\0')
    .update(input.commits)
    .update('\0')
    .update(input.agent)
    .update('\0')
    .update(JSON.stringify(input.config))
    .digest('hex')
}
