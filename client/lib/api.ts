import type { ClientConfig } from '../../src/config'
import { getJson } from './request'

export type { ClientConfig }

/** Reads the limits the server enforces, so a disabled button and a server check
 * can never disagree (R-CFG-2). */
export async function fetchConfig(): Promise<ClientConfig> {
  return getJson<ClientConfig>('/api/config', 'config unavailable')
}
