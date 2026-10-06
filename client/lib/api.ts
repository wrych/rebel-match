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
    inviteLabelMaxChars: number
    savedTickMs: number
    matchesPollSeconds: number
    notificationsPageSize: number
    erasureGraceDays: number
    holdToSelectMs: number
    inviteMaxUsesCeiling: number
  }
  consentVersion: string
  analyticsVersion: string
  feedbackTo: string
  /** The running version, `dev` without a link on a local build (R-NFR-11). */
  build: { commit: string; url: string | null }
}

/** Reads the limits the server enforces, so a disabled button and a server check
 * can never disagree (R-CFG-2). */
export async function fetchConfig(): Promise<ClientConfig> {
  const response = await fetch('/api/config')
  if (!response.ok)
    throw new Error(`config unavailable (${String(response.status)})`)

  return (await response.json()) as ClientConfig
}
