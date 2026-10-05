export interface ClientConfig {
  limits: {
    challengeMinChars: number
    connectionMessageMaxChars: number
    beenThereNoteMinChars: number
    magicLinkTtlMinutes: number
    approvalLinkTtlHours: number
    inviteDefaultMaxUses: number
    inviteDefaultHours: number
    nameMaxChars: number
    jobTitleMaxChars: number
    orgMaxChars: number
    sectorMaxChars: number
    inviteLabelMaxChars: number
    savedTickMs: number
    holdToSelectMs: number
    inviteMaxUsesCeiling: number
  }
  consentVersion: string
  analyticsVersion: string
  feedbackTo: string
}

/** Reads the limits the server enforces, so a disabled button and a server check
 * can never disagree (R-CFG-2). */
export async function fetchConfig(): Promise<ClientConfig> {
  const response = await fetch('/api/config')
  if (!response.ok)
    throw new Error(`config unavailable (${String(response.status)})`)

  return (await response.json()) as ClientConfig
}
