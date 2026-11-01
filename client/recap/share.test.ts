// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { paletteOfPage, saveCard, shareCard, type ShareHost } from './share'

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

describe('sharing the card, LinkedIn first (R-RECAP-6)', () => {
  it('hands the card and the post to a share sheet that takes files', async () => {
    const shared: ShareData[] = []
    const fake = host({
      canShare: () => true,
      share: (data) => {
        shared.push(data)
        return Promise.resolve()
      },
    })

    const via = await shareCard(file, 'post', fake.host)

    expect(via).toBe('share_sheet')
    expect(shared).toEqual([{ files: [file], text: 'post' }])
    expect(fake.opened).toEqual([])
  })

  it('elsewhere saves the card and opens LinkedIn with the post', async () => {
    const fake = host()

    const via = await shareCard(file, 'my post', fake.host)

    expect(via).toBe('linkedin')
    expect(fake.saved).toEqual([file])
    expect(fake.opened).toEqual([
      'https://www.linkedin.com/feed/?shareActive=true&text=my%20post',
    ])
  })

  it('falls back to LinkedIn when the sheet cannot take files', async () => {
    const fake = host({ canShare: () => false, share: () => Promise.reject() })

    expect(await shareCard(file, 'post', fake.host)).toBe('linkedin')
  })

  it('does nothing more when the member backs out of the sheet', async () => {
    const fake = host({
      canShare: () => true,
      share: () => Promise.reject(new DOMException('no', 'AbortError')),
    })

    expect(await shareCard(file, 'post', fake.host)).toBeNull()
    expect(fake.opened).toEqual([])
  })

  it('falls back when the sheet fails otherwise', async () => {
    const fake = host({
      canShare: () => true,
      share: () => Promise.reject(new Error('denied')),
    })

    expect(await shareCard(file, 'post', fake.host)).toBe('linkedin')
  })

  it('saves the image on its own', () => {
    const fake = host()

    expect(saveCard(file, fake.host)).toBe('image')
    expect(fake.saved).toEqual([file])
  })
})

describe('the card’s palette', () => {
  it('reads the page’s colours, with the app’s own as fallbacks', () => {
    document.documentElement.style.setProperty('--accent', '#ff2e93')

    const palette = paletteOfPage(document.documentElement)

    expect(palette.accent).toBe('#ff2e93')
    expect(palette.paper).toBe('#faf8f4')
  })
})
