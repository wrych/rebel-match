import {
  experiments,
  type Assigned,
  type ExperimentKey,
  type Variant,
} from '../../src/experiments'
import { reportEvent } from './events'

/** The member's variant of `key`, as the server assigned it; the control when
 * it cannot be read, so a failure only ever shows what was there before
 * (R-EXP-1). */
export async function variantOf<K extends ExperimentKey>(
  key: K,
): Promise<{ variant: Variant<K>; assigned: boolean }> {
  try {
    const response = await fetch('/api/flags')
    if (response.ok) {
      const { flags } = (await response.json()) as { flags: Assigned }
      return { variant: flags[key], assigned: true }
    }
  } catch {
    // Read as unassigned below.
  }
  return { variant: experiments[key][0], assigned: false }
}

/** Tells analytics which variant the member was shown, once they see it
 * (R-EXP-2). */
export function reportExposure<K extends ExperimentKey>(
  experiment: K,
  variant: Variant<K>,
): void {
  reportEvent({ event: 'experiment_exposed', props: { experiment, variant } })
}
