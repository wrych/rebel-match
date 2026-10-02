import { describe, expect, it } from 'vitest'
import { signSessionId } from '../auth/cookie.js'
import { createApplicantHandles } from './applicant-handle.js'

const secret = 'x'.repeat(32)
const handles = createApplicantHandles(secret)

describe('createApplicantHandles', () => {
  it('reads back the address it was issued for (R-AUTH-11)', () => {
    const handle = handles.issue('ada@example.invalid')

    expect(handles.read(handle)).toBe('ada@example.invalid')
  })

  it('refuses a handle forged for another address', () => {
    const [, signature] = handles.issue('ada@example.invalid').split('.')
    const other = Buffer.from('bob@example.invalid').toString('base64url')

    expect(handles.read(`${other}.${String(signature)}`)).toBeNull()
  })

  it('refuses a handle made under another secret', () => {
    const foreign = createApplicantHandles('y'.repeat(32))

    expect(handles.read(foreign.issue('ada@example.invalid'))).toBeNull()
  })

  it('refuses a session cookie value, though both share the secret', () => {
    const encoded = Buffer.from('ada@example.invalid').toString('base64url')
    const cookie = signSessionId(encoded, secret)

    expect(handles.read(cookie)).toBeNull()
  })

  it.each(['', 'no-dot', '.abc', 'abc.'])('refuses %j', (handle) => {
    expect(handles.read(handle)).toBeNull()
  })
})
