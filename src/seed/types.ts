import type { RoleKey } from '../access.js'

export interface SeedRole {
  key: RoleKey
  label: string
  description: string
}

/** A member a seed creates, keyed by email (R-SEED-7). Seeded members arrive
 * active and onboarded, consent recorded at the version in force. */
export interface SeedMember {
  email: string
  name: string
  jobTitle: string
  org: string
  sector: string
  roles: RoleKey[]
}

export interface SeedPlan {
  roles: SeedRole[]
  members: SeedMember[]
}
