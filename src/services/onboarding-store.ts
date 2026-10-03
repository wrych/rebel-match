import type { RowDataPacket } from 'mysql2/promise'
import type { Pool } from '../db.js'
import type { OnboardingStore } from './onboarding.js'

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

/** Onboarding over `members` (design §2). `requested_name` and
 * `requested_org` only pre-fill; they are never copied without the member
 * submitting them (R-AUTH-12). */
export function createMysqlOnboardingStore(pool: Pool): OnboardingStore {
  return {
    draft: async (memberId) => {
      const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT name, requested_name, job_title, org, requested_org, sector ' +
          'FROM members WHERE id = ?',
        [memberId],
      )
      const row = rows[0]
      if (row === undefined) return null
      return {
        name: text(row['name']) ?? text(row['requested_name']),
        jobTitle: text(row['job_title']),
        org: text(row['org']) ?? text(row['requested_org']),
        sector: text(row['sector']),
      }
    },
    save: async (memberId, input, acceptedAt) => {
      await pool.query(
        'UPDATE members SET name = ?, job_title = ?, org = ?, sector = ?, ' +
          'consent_version = ?, consent_at = ? WHERE id = ?',
        [
          input.name,
          input.jobTitle ?? null,
          input.org ?? null,
          input.sector ?? null,
          input.consentVersion,
          acceptedAt,
          memberId,
        ],
      )
    },
  }
}
