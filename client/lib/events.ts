/** The two UI events of design §7, sent to our own server, which relays them
 * to analytics for an opted-in member only (ADR 0026). */
export type UiEvent =
  | { event: 'journey_chosen'; props: { journey: 'ask' | 'offer' } }
  | { event: 'feedback_opened'; props: { screen: string } }

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
