/** One setting as `GET /api/admin/settings` sends it (R-CFG-5). */
export interface Setting {
  name: string
  explanation: string
  value: string
  envVar?: string
  changed: boolean
  fixed: boolean
}

export interface SettingsGroup {
  title: string
  explanation: string
  settings: Setting[]
}

/** Reads the configuration in its named groups, read-only (R-CFG-5). */
export async function fetchSettings(): Promise<SettingsGroup[]> {
  const response = await fetch('/api/admin/settings')
  if (!response.ok)
    throw new Error(`settings unavailable (${String(response.status)})`)
  return ((await response.json()) as { groups: SettingsGroup[] }).groups
}
