import { describe, expect, it } from 'vitest'
import { linkNotice } from './link-notice'

describe('linkNotice', () => {
  it.each([
    ['?link=expired', 'has expired'],
    ['?link=used', 'already been used'],
    ['?link=unknown', 'is not valid'],
  ])('explains %s and offers a new link (R-AUTH-6)', (search, says) => {
    const notice = linkNotice(search)

    expect(notice).toContain(says)
    expect(notice).toContain('send you a new one')
  })

  it('says nothing without a reason, or with one it does not know', () => {
    expect(linkNotice('')).toBeNull()
    expect(linkNotice('?link=<script>')).toBeNull()
    expect(linkNotice('?link=toString')).toBeNull()
  })
})
