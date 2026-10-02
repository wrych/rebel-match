import { describe, expect, it } from 'vitest'
import {
  readCookie,
  sessionCookie,
  signSessionId,
  unsignSessionId,
} from './cookie.js'

const secret = 's'.repeat(32)

describe('signed session ids', () => {
  it('round-trips an id signed with the same secret', () => {
    expect(unsignSessionId(signSessionId('abc', secret), secret)).toBe('abc')
  })

  it('rejects a value signed with another secret', () => {
    const forged = signSessionId('abc', 'o'.repeat(32))

    expect(unsignSessionId(forged, secret)).toBeNull()
  })

  it('rejects an id swapped under a valid signature', () => {
    const [, signature] = signSessionId('abc', secret).split('.')

    expect(unsignSessionId(`abd.${signature!}`, secret)).toBeNull()
  })

  it.each(['', 'abc', '.sig', 'abc.short'])(
    'rejects the malformed value %j',
    (value) => {
      expect(unsignSessionId(value, secret)).toBeNull()
    },
  )
})

describe('readCookie', () => {
  it('finds a cookie among others', () => {
    expect(readCookie('a=1; rm_session=v.s; b=2', 'rm_session')).toBe('v.s')
  })

  it('is null when the cookie or the header is absent', () => {
    expect(readCookie('a=1; b', 'rm_session')).toBeNull()
    expect(readCookie(undefined, 'rm_session')).toBeNull()
  })

  it('does not match a cookie whose name merely ends the same way', () => {
    expect(readCookie('xrm_session=v', 'rm_session')).toBeNull()
  })
})

describe('sessionCookie', () => {
  it('is http-only, same-site lax and persistent (R-AUTH-7, R-NFR-5)', () => {
    const cookie = sessionCookie('v', 1000, true)

    expect(cookie.options).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 1000,
    })
  })
})
