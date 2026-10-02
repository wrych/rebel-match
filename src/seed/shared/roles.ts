import type { SeedRole } from '../types.js'

/** The role records both profiles need (R-SEED-1, design §2). Permissions are
 * not here: they live in config, where they are reviewed (R-ROLE-6). */
export const roles: SeedRole[] = [
  {
    key: 'member',
    label: 'Member',
    description: 'Posts challenges, swipes and connects',
  },
  {
    key: 'admin',
    label: 'Admin',
    description: 'Reviews applicants, manages invites, reads the outbound log',
  },
]
