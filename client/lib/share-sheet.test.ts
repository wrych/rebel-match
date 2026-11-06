// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  linkedInUrl,
  saveImage,
  shareImage,
  type ShareHost,
} from './share-sheet'

const file = new File(['png'], 'rebel-record.png', { type: 'image/png' })

function host(overrides: Partial<ShareHost> = {}): {
  host: ShareHost
  opened: string[]
  saved: File[]
  shared: ShareData[]
} {
  const opened: string[] = []
  const saved: File[] = []
  const shared: ShareData[] = []
  return {
    opened,
    saved,
    shared,
    host: {
      open: (url) => opened.push(url),
      save: (each) => saved.push(each),
      ...overrides,
    },
  }
}

describe('sharing an image (R-RECAP-6)', () => {
  it('hands the image alone to the sheet, the post copied in the same tap', async () => {
    const steps: string[] = []
    const shared: ShareData[] = []
    const fake = host({
      canShare: () => true,
      copy: (text) => {
        steps.push(`copy ${text}`)
        return new Promise(() => undefined)
      },
      share: (data) => {
        steps.push('share')
        shared.push(data)
        return Promise.resolve()
      },
    })

    const via = await shareImage(file, 'post', fake.host)

    expect(via).toBe('share_sheet')
    expect(shared).toEqual([{ files: [file] }])
    expect(steps).toEqual(['copy post', 'share'])
    expect(fake.opened).toEqual([])
  })

  it('elsewhere saves the card and opens LinkedIn with the post', async () => {
    const fake = host()

    const via = await shareImage(file, 'my post', fake.host)

    expect(via).toBe('linkedin')
    expect(fake.saved).toEqual([file])
    expect(fake.opened).toEqual([
      'https://www.linkedin.com/feed/?shareActive=true&text=my%20post',
    ])
  })

  it('falls back to LinkedIn when the sheet cannot take files', async () => {
    const fake = host({ canShare: () => false, share: () => Promise.reject() })

    expect(await shareImage(file, 'post', fake.host)).toBe('linkedin')
  })

  it('does nothing more when the member backs out of the sheet', async () => {
    const fake = host({
      canShare: () => true,
      share: () => Promise.reject(new DOMException('no', 'AbortError')),
    })

    expect(await shareImage(file, 'post', fake.host)).toBeNull()
    expect(fake.opened).toEqual([])
  })

  it('falls back when the sheet fails otherwise', async () => {
    const fake = host({
      canShare: () => true,
      share: () => Promise.reject(new Error('denied')),
    })

    expect(await shareImage(file, 'post', fake.host)).toBe('linkedin')
  })

  it('opens LinkedIn’s composer with the text filled in', () => {
    expect(linkedInUrl('a & b')).toBe(
      'https://www.linkedin.com/feed/?shareActive=true&text=a%20%26%20b',
    )
  })

  it('saves the image on its own', () => {
    const fake = host()

    expect(saveImage(file, fake.host)).toBe('image')
    expect(fake.saved).toEqual([file])
  })
})
