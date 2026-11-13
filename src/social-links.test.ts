import { describe, expect, it } from 'vitest'
import { handleOf, readSocialLink } from './social-links.js'

const MAX = 200

describe('readSocialLink (R-PROF-5)', () => {
  it('reads blank as clearing the link', () => {
    expect(readSocialLink('   ', MAX)).toEqual({ result: 'blank' })
  })

  it('saves a LinkedIn address as https, without its query or fragment', () => {
    expect(
      readSocialLink(' http://www.linkedin.com/in/ada-l?trk=x#top ', MAX),
    ).toEqual({ result: 'link', url: 'https://www.linkedin.com/in/ada-l' })
  })

  it('takes an address typed without its scheme, and a country site', () => {
    expect(readSocialLink('ch.linkedin.com/in/ada/', MAX)).toEqual({
      result: 'link',
      url: 'https://www.linkedin.com/in/ada',
    })
  })

  it.each([
    'javascript:alert(1)',
    'https://linkedin.com.example.org/in/ada',
    'https://notlinkedin.com/in/ada',
    'https://www.example.org/in/ada',
    'https://www.linkedin.com/',
    'https://user@www.linkedin.com/in/ada',
    'https://www.linkedin.com:8443/in/ada',
    'ftp://www.linkedin.com/in/ada',
    '@ada',
    'https://www.linkedin.com/posts/ada-123',
    'https://www.linkedin.com/company/rebels',
    'https://www.linkedin.com/in/ada/details/skills',
  ])('refuses %s', (typed) => {
    expect(readSocialLink(typed, MAX)).toEqual({ result: 'invalid' })
  })

  it('refuses a link longer than the limit', () => {
    const long = `https://www.linkedin.com/in/${'a'.repeat(MAX)}`
    expect(readSocialLink(long, MAX)).toEqual({ result: 'invalid' })
  })
})

describe('handleOf (R-PROF-5)', () => {
  it('reads a LinkedIn link as its path, without a trailing slash', () => {
    expect(handleOf('https://www.linkedin.com/in/andymoesch/')).toBe(
      '/in/andymoesch',
    )
  })
})
