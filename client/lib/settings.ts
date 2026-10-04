/** One setting as `GET /api/admin/settings` sends it (R-CFG-5, R-CFG-6). */
export interface Setting {
  name: string
  explanation: string
  value: string
  envVar?: string
  changed: boolean
  fixed: boolean
  editable?: {
    key: string
    number: number
    min: number
    max: number
    unit: string
  }
  override?: { by: string | null; at: string; deploymentValue: string }
}

export interface SettingsGroup {
  title: string
  explanation: string
  settings: Setting[]
}

export type SaveResult = 'saved' | 'out_of_bounds' | 'out_of_order'

/** Reads the configuration in its named groups (R-CFG-5). */
export async function fetchSettings(): Promise<SettingsGroup[]> {
  const response = await fetch('/api/admin/settings')
  if (!response.ok)
    throw new Error(`settings unavailable (${String(response.status)})`)
  return ((await response.json()) as { groups: SettingsGroup[] }).groups
}

/** Changes a setting hosts may change (R-CFG-6); a refused value comes back
 * as the reason, anything else unexpected throws. */
export async function saveSetting(
  key: string,
  value: number,
): Promise<SaveResult> {
  const response = await fetch(`/api/admin/settings/${key}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ value }),
  })
  if (response.ok) return 'saved'
  if (response.status === 400) {
    const { error } = (await response.json()) as { error: string }
    if (error === 'out_of_bounds' || error === 'out_of_order') return error
  }
  throw new Error(`saving the setting failed (${String(response.status)})`)
}

/** Goes back to the deployment's value (R-CFG-6), unless that would put a
 * free number above its "at most" number. */
export async function resetSetting(
  key: string,
): Promise<'saved' | 'out_of_order'> {
  const response = await fetch(`/api/admin/settings/${key}`, {
    method: 'DELETE',
  })
  if (response.ok) return 'saved'
  if (response.status === 400) return 'out_of_order'
  throw new Error(`resetting the setting failed (${String(response.status)})`)
}
