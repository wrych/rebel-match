import type { SettingView, SettingsGroup } from '../../src/settings-view'

import { failure, getJson, jsonOf, send } from './request'

export type { SettingView, SettingsGroup }

/** Why a change was refused: outside its bounds, or a ceiling below the free
 * uses it caps (R-CFG-6). */
export type Refusal = 'out_of_bounds' | 'out_of_order'

type Groups = { groups: SettingsGroup[] }

async function answer(
  response: Response,
  what: string,
): Promise<SettingsGroup[] | Refusal> {
  if (response.status === 400) {
    const { error } = (await response.json()) as { error?: string }
    if (error === 'out_of_bounds' || error === 'out_of_order') return error
    throw failure(what, response)
  }
  return (await jsonOf<Groups>(response, what)).groups
}

/** Reads the configuration in its named groups (R-CFG-5). */
export async function fetchSettings(): Promise<SettingsGroup[]> {
  return (await getJson<Groups>('/api/admin/settings', 'settings unavailable'))
    .groups
}

/** Sets a changeable setting; the groups as they now stand, or why it was
 * refused. Throws on anything else, so a failure never shows as saved. */
export async function changeSetting(
  key: string,
  value: number,
): Promise<SettingsGroup[] | Refusal> {
  const response = await send(
    `/api/admin/settings/${encodeURIComponent(key)}`,
    'PUT',
    { value },
  )
  return answer(response, 'setting not saved')
}

/** Goes back to the deployment's value (R-CFG-6). */
export async function resetSetting(
  key: string,
): Promise<SettingsGroup[] | Refusal> {
  const response = await send(
    `/api/admin/settings/${encodeURIComponent(key)}`,
    'DELETE',
  )
  return answer(response, 'setting not reset')
}
