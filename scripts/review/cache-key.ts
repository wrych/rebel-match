import { createHash } from 'node:crypto'

/** What a cached verdict was given. */
export interface ReviewInput {
  diff: string
  agent: string
  config: unknown
}

export function cacheKey(input: ReviewInput): string {
  return createHash('sha256')
    .update(input.diff)
    .update(input.agent)
    .update(JSON.stringify(input.config))
    .digest('hex')
}
