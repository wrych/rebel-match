import type { ExperimentKey } from '../../src/experiments'

/** The UI events of design §7, sent to our own server, which relays them to
 * analytics for an opted-in member only (ADR 0026). */
export type UiEvent =
  | { event: 'journey_chosen'; props: { journey: 'ask' | 'offer' } }
  | { event: 'feedback_opened'; props: { screen: string } }
  | { event: 'game_opened'; props: Record<string, never> }
  | {
      event: 'experiment_exposed'
      props: { experiment: ExperimentKey; variant: string }
    }
  | {
      event: 'matches_section_opened'
      props: { section: 'same_boat' | 'been_there' | 'cases' }
    }
  | {
      event: 'match_connect_tapped'
      props: { kind: 'same_boat' | 'been_there' }
    }

/** Fire and forget: `keepalive` lets the request finish while the page moves
 * on, and a failure is never the member's problem. */
export function reportEvent(uiEvent: UiEvent): void {
  fetch('/api/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(uiEvent),
    keepalive: true,
  }).catch(() => undefined)
}
