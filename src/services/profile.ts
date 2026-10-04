/** The member's own profile and privacy as `/profile` shows them (S24,
 * R-PROF-1,2). The email is shown, never edited. */
export interface OwnProfile {
  name: string | null
  jobTitle: string | null
  org: string | null
  email: string
  consentVersion: string | null
  consentAt: string | null
  analyticsOptIn: boolean
}

export interface ProfileEdit {
  name: string
  jobTitle?: string | undefined
  org?: string | undefined
}

export interface ProfileStore {
  own(memberId: string): Promise<OwnProfile | null>
  /** Saves the name and sets job title and organization, clearing a left-out
   * one; sector is kept as it is. */
  update(memberId: string, edit: ProfileEdit): Promise<void>
}
