/** Gives or withdraws the analytics opt-in (R-ANA-4, ADR 0026); `from` marks
 * the usage step of onboarding (R-ANA-6). 'stale' when the words changed
 * since the member read them. */
export async function chooseAnalytics(
  optIn: boolean,
  version: string,
  from?: 'onboarding',
): Promise<'done' | 'stale'> {
  const response = await fetch('/api/me/analytics', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(
      optIn ? { optIn, version, ...(from ? { from } : {}) } : { optIn },
    ),
  })
  if (response.status === 409) return 'stale'
  if (!response.ok)
    throw new Error(`analytics choice not saved (${String(response.status)})`)
  return 'done'
}
