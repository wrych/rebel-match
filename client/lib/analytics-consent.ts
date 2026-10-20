import { outcomeOf, send } from './request'

/** Gives or withdraws the analytics opt-in (R-ANA-4, ADR 0026); `from` marks
 * an answer on the usage step of onboarding (R-ANA-6). 'stale' when the words changed
 * since the member read them. */
export async function chooseAnalytics(
  optIn: boolean,
  version: string,
  from?: 'onboarding',
): Promise<'done' | 'stale'> {
  const response = await send('/api/me/analytics', 'PUT', {
    optIn,
    ...(optIn ? { version } : {}),
    ...(from ? { from } : {}),
  })
  return outcomeOf(response, 'analytics choice not saved', {
    409: 'stale' as const,
    ok: 'done' as const,
  })
}
