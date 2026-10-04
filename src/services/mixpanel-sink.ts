import { randomUUID } from 'node:crypto'
import type { AnalyticsEvent, AnalyticsSink } from './analytics.js'

/** Thrown for a send Mixpanel did not accept. It carries the HTTP status and
 * the event name only, never a member's data. */
export class AnalyticsSendError extends Error {
  constructor(event: string, status: number) {
    super(`analytics: ${event} not accepted (HTTP ${String(status)})`)
    this.name = 'AnalyticsSendError'
  }
}

/** Sends events to Mixpanel's ingestion API on `apiHost`, the EU endpoint by
 * configuration (ADR 0005). `ip=0` keeps Mixpanel from geolocating our server;
 * `$insert_id` lets it drop a retried duplicate. */
export function createMixpanelSink(deps: {
  token: string
  apiHost: string
  fetch?: typeof fetch
}): AnalyticsSink {
  const post = deps.fetch ?? fetch
  const url = `https://${deps.apiHost}/track?ip=0&verbose=1`
  return {
    send: async (distinctId, event, at) => {
      const { name, ...props } = event as AnalyticsEvent & {
        [key: string]: unknown
      }
      const response = await post(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify([
          {
            event: name,
            properties: {
              ...props,
              token: deps.token,
              distinct_id: distinctId,
              time: at.getTime(),
              $insert_id: randomUUID(),
            },
          },
        ]),
      })
      const accepted =
        response.ok &&
        ((await response.json()) as { status?: number }).status === 1
      if (!accepted) throw new AnalyticsSendError(name, response.status)
    },
  }
}
