import { createHash } from 'node:crypto'
import {
  experimentKeys,
  experiments,
  type Assigned,
  type ExperimentKey,
  type FlagSettings,
  type Variant,
} from './experiments.js'

const PERCENT = 100
// The leading bytes of the hash that pick the bucket: enough for an even
// spread over a hundred buckets.
const BUCKET_HEX_DIGITS = 8

/** The member's bucket in an experiment, 0 to 99, from the experiment's key
 * and the member's id alone: the same on every device, and unrelated from one
 * experiment to the next. */
export function bucketOf(key: ExperimentKey, memberId: string): number {
  const digest = createHash('sha256').update(`${key}:${memberId}`).digest('hex')
  return Number.parseInt(digest.slice(0, BUCKET_HEX_DIGITS), 16) % PERCENT
}

/** The member's variant of every experiment: the treatment for the buckets
 * below its share, so raising the share only moves members to it. */
export function assign(memberId: string, shares: FlagSettings): Assigned {
  const variantOf = <K extends ExperimentKey>(key: K): Variant<K> => {
    const [control, treatment] = experiments[key]
    return bucketOf(key, memberId) < shares[key] ? treatment : control
  }
  return Object.fromEntries(
    experimentKeys.map((key) => [key, variantOf(key)]),
  ) as Assigned
}
