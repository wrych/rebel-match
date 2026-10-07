/** A journey the step header shows: the name it announces and its three
 * step labels, in order (R-LOOK-4, ADR 0040). */
export interface Journey {
  name: string
  labels: readonly [string, string, string]
}

export const askJourney: Journey = {
  name: 'Ask for help',
  labels: ['Describe', 'Domain', 'Matches'],
}

export const onboardingJourney: Journey = {
  name: 'Onboarding',
  labels: ['Profile', 'Privacy', 'Usage'],
}
