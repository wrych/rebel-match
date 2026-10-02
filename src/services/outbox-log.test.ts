import { describe, expect, it } from 'vitest'
import { retentionCutoff } from './outbox-log.js'

describe('retentionCutoff', () => {
  it('lies exactly the retention window before now (R-MSG-6)', () => {
    expect(retentionCutoff(new Date('2026-11-08T10:00:00Z'), 90)).toEqual(
      new Date('2026-08-10T10:00:00Z'),
    )
  })
})
