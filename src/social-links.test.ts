import { describe, expect, it } from 'vitest'
import { handleOf, readSocialLink } from './social-links.js'

const MAX = 200

describe('readSocialLink (R-PROF-5)', () => {
  it('reads blank as clearing the link', () => {
    expect(readSocialLink('linkedin', '   ', MAX)).toEqual({ result: 'blank' })
  })

  it('saves a LinkedIn address as https, without its query or fragment', () => {
    expect(
      readSocialLink(
        'linkedin',
        ' http://www.linkedin.com/in/ada-l?trk=x#top ',
        MAX,
      ),
    ).toEqual({ result: 'link', url: 'https://www.linkedin.com/in/ada-l' })
  })

  it('takes an address typed without its scheme, and a country site', () => {
    expect(readSocialLink('linkedin', 'ch.linkedin.com/in/ada', MAX)).toEqual({
      result: 'link',
      url: 'https://ch.linkedin.com/in/ada',
    })
  })

  it('reads an Instagram handle as its profile address', () => {
    expect(readSocialLink('instagram', '@ada.l_', MAX)).toEqual({
      result: 'link',
      url: 'https://www.instagram.com/ada.l_',
    })
    expect(readSocialLink('instagram', 'instagram.com/ada', MAX)).toEqual({
      result: 'link',
      url: 'https://instagram.com/ada',
    })
  })

  it.each([
    ['linkedin', 'javascript:alert(1)'],
    ['linkedin', 'https://linkedin.com.example.org/in/ada'],
    ['linkedin', 'https://notlinkedin.com/in/ada'],
    ['linkedin', 'https://www.instagram.com/ada'],
    ['linkedin', 'https://www.linkedin.com/'],
    ['linkedin', 'https://user@www.linkedin.com/in/ada'],
    ['linkedin', 'https://www.linkedin.com:8443/in/ada'],
    ['linkedin', 'ftp://www.linkedin.com/in/ada'],
    ['linkedin', '@ada'],
    ['instagram', 'https://evil.instagram.com/ada'],
    ['instagram', '@not a handle'],
    ['instagram', 'ada'],
  ] as const)('refuses %s link %s', (network, typed) => {
    expect(readSocialLink(network, typed, MAX)).toEqual({ result: 'invalid' })
  })

  it('refuses a link longer than the limit', () => {
    const long = `https://www.linkedin.com/in/${'a'.repeat(MAX)}`
    expect(readSocialLink('linkedin', long, MAX)).toEqual({ result: 'invalid' })
  })
})

describe('handleOf (R-PROF-5)', () => {
  it('reads a LinkedIn link as its path, without a trailing slash', () => {
    expect(
      handleOf('linkedin', 'https://www.linkedin.com/in/andymoesch/'),
    ).toBe('/in/andymoesch')
  })

  it('reads an Instagram link as its @handle', () => {
    expect(handleOf('instagram', 'https://www.instagram.com/ada.l_/')).toBe(
      '@ada.l_',
    )
  })
})
