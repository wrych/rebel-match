import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CADENCE,
  dueAt,
  nextDaily,
  offeredCadences,
} from './notification-cadence.js'

const zurich = { dailyAt: '08:00', timeZone: 'Europe/Zurich' }
const at = (iso: string): Date => new Date(iso)

describe('the options (R-NOTE-2)', () => {
  it('offers five to everyone, and every 15 minutes for applicants only', () => {
    expect(offeredCadences('connection_request')).toEqual([
      'immediately',
      'hourly',
      'daily',
      'in_app',
      'off',
    ])
    expect(offeredCadences('applicant')).toEqual([
      'immediately',
      'every_15_minutes',
      'hourly',
      'daily',
      'in_app',
      'off',
    ])
  })

  it('defaults requests and connections hourly, trends daily, applicants every 15 minutes', () => {
    expect(DEFAULT_CADENCE).toEqual({
      connection_request: 'hourly',
      new_connection: 'hourly',
      trend_challenge: 'daily',
      applicant: 'every_15_minutes',
    })
  })
})

describe('nextDaily', () => {
  it.each([
    [
      'before the time, the same day',
      '2026-11-08T06:00:00Z',
      '2026-11-08T07:00:00.000Z',
    ],
    [
      'after it, the next day',
      '2026-11-08T07:30:00Z',
      '2026-11-09T07:00:00.000Z',
    ],
    [
      'at it exactly, the next day',
      '2026-11-08T07:00:00Z',
      '2026-11-09T07:00:00.000Z',
    ],
    [
      'in summer time, an hour earlier in UTC',
      '2026-07-01T05:00:00Z',
      '2026-07-01T06:00:00.000Z',
    ],
    [
      'across the change to winter time',
      '2026-10-24T07:00:00Z',
      '2026-10-25T07:00:00.000Z',
    ],
    [
      'late in the evening UTC, the local next day',
      '2026-11-08T23:30:00Z',
      '2026-11-09T07:00:00.000Z',
    ],
  ])('falls %s', (_case, after, expected) => {
    expect(nextDaily(at(after), zurich).toISOString()).toBe(expected)
  })
})

describe('dueAt (R-NOTE-7)', () => {
  const now = at('2026-11-08T10:00:00Z')

  it('mails at once immediately, and never in the app only or off', () => {
    expect(dueAt('immediately', now, now, now, zurich)).toEqual(now)
    expect(dueAt('in_app', null, now, now, zurich)).toBeNull()
    expect(dueAt('off', null, now, now, zurich)).toBeNull()
  })

  it('mails the first at once, then one window after the last of the cadence', () => {
    expect(dueAt('hourly', null, now, now, zurich)).toEqual(now)
    expect(
      dueAt('hourly', at('2026-11-08T09:20:00Z'), now, now, zurich),
    ).toEqual(at('2026-11-08T10:20:00Z'))
    expect(
      dueAt('every_15_minutes', at('2026-11-08T09:50:00Z'), now, now, zurich),
    ).toEqual(at('2026-11-08T10:05:00Z'))
  })

  it('mails daily at the time after the last daily mail, or after the oldest waiting', () => {
    expect(
      dueAt('daily', null, at('2026-11-08T09:00:00Z'), now, zurich),
    ).toEqual(at('2026-11-09T07:00:00Z'))
    expect(
      dueAt(
        'daily',
        at('2026-11-07T07:00:00Z'),
        at('2026-11-07T20:00:00Z'),
        now,
        zurich,
      ),
    ).toEqual(at('2026-11-08T07:00:00Z'))
  })
})
