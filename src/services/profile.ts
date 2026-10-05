import type { CompanySize, Sector } from '../profile-options.js'

/** The member's own profile and privacy as `/profile` shows them (S24,
 * R-PROF-1,2). The email is shown, never edited. */
export interface OwnProfile {
  name: string | null
  jobTitle: string | null
  org: string | null
  sector: string | null
  companySize: string | null
  email: string
  consentVersion: string | null
  consentAt: string | null
  analyticsOptIn: boolean
}

export interface ProfileEdit {
  name: string
  jobTitle?: string | undefined
  org?: string | undefined
  sector?: Sector | undefined
  companySize?: CompanySize | undefined
}

export interface ProfileStore {
  own(memberId: string): Promise<OwnProfile | null>
  /** Saves the name and sets the optional fields, clearing a left-out one. */
  update(memberId: string, edit: ProfileEdit): Promise<void>
}
