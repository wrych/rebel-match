import type { PresentationData } from '../presentation/world'
import { getJson } from './request'

/** The network and its cast for the summit film (R-PRES-1, R-PRES-6). */
export async function fetchPresentation(): Promise<PresentationData> {
  return getJson<PresentationData>(
    '/api/admin/presentation',
    'presentation unavailable',
  )
}
