import type { SettingView, SettingsGroup } from '../../src/settings-view'

export type { SettingView, SettingsGroup }

/** Why a change was refused: outside its bounds, or a ceiling below the free
 * uses it caps (R-CFG-6). */
export type Refusal = 'out_of_bounds' | 'out_of_order'

async function groupsOf(response: Response): Promise<SettingsGroup[]> {
  return ((await response.json()) as { groups: SettingsGroup[] }).groups
}

async function answer(
  response: Response,
  what: string,
): Promise<SettingsGroup[] | Refusal> {
  if (response.ok) return groupsOf(response)
  if (response.status === 400) {
    const { error } = (await response.json()) as { error?: string }
    if (error === 'out_of_bounds' || error === 'out_of_order') return error
  }
  throw new Error(`${what} (${String(response.status)})`)
}

/** Reads the configuration in its named groups (R-CFG-5). */
export async function fetchSettings(): Promise<SettingsGroup[]> {
  const response = await fetch('/api/admin/settings')
  if (!response.ok)
    throw new Error(`settings unavailable (${String(response.status)})`)
  return groupsOf(response)
}

/** Sets a changeable setting; the groups as they now stand, or why it was
 * refused. Throws on anything else, so a failure never shows as saved. */
export async function changeSetting(
  key: string,
  value: number,
): Promise<SettingsGroup[] | Refusal> {
  const response = await fetch(
    `/api/admin/settings/${encodeURIComponent(key)}`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value }),
    },
  )
  return answer(response, 'setting not saved')
}

/** Goes back to the deployment's value (R-CFG-6). */
export async function resetSetting(
  key: string,
): Promise<SettingsGroup[] | Refusal> {
  const response = await fetch(
    `/api/admin/settings/${encodeURIComponent(key)}`,
    { method: 'DELETE' },
  )
  return answer(response, 'setting not reset')
}
