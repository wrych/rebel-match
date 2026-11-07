import { describe, expect, it } from 'vitest'
import { cleanPhoto, createPhotoService, type StoredPhoto } from './photo.js'

const limits = { photoMaxBytes: 4096, photoSidePx: 512 }

function segment(marker: number, payload: number[]): number[] {
  const length = payload.length + 2
  return [0xff, marker, length >> 8, length & 0xff, ...payload]
}

function frame(width: number, height: number, marker = 0xc0): number[] {
  return segment(marker, [
    8,
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
    1,
    1,
    0x11,
    0,
  ])
}

const ascii = (text: string): number[] => [...Buffer.from(text, 'latin1')]
const JFIF = segment(0xe0, ascii('JFIF\0'))
const EXIF = segment(0xe1, ascii('Exif\0\0GPS 47.37N 8.54E'))
const XMP = segment(0xe1, ascii('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta/>'))
const COMMENT = segment(0xfe, ascii('shot at home'))
const TABLE = segment(0xdb, [0, ...Array<number>(64).fill(1)])
const SCAN = [...segment(0xda, [1, 1, 0, 0, 63, 0]), 0x12, 0xff, 0x00, 0x34]

function jpeg(...parts: number[][]): Buffer {
  return Buffer.from([0xff, 0xd8, ...parts.flat(), 0xff, 0xd9])
}

const photo = (...headers: number[][]): Buffer =>
  jpeg(JFIF, ...headers, TABLE, frame(512, 512), SCAN)

describe('cleanPhoto', () => {
  it('drops EXIF, XMP and comments and keeps the picture', () => {
    const outcome = cleanPhoto(photo(EXIF, XMP, COMMENT), limits)
    expect(outcome).toEqual({ result: 'clean', jpeg: photo() })
    const text = outcome.result === 'clean' ? outcome.jpeg.toString() : ''
    expect(text).not.toContain('GPS')
    expect(text).not.toContain('xmpmeta')
    expect(text).not.toContain('home')
  })

  it('keeps a photo without metadata as it is', () => {
    expect(cleanPhoto(photo(), limits)).toEqual({
      result: 'clean',
      jpeg: photo(),
    })
  })

  it('drops metadata placed between the scans of a progressive JPEG', () => {
    const between = jpeg(
      JFIF,
      TABLE,
      frame(512, 512, 0xc2),
      SCAN,
      EXIF,
      COMMENT,
      SCAN,
    )
    const outcome = cleanPhoto(between, limits)
    expect(outcome).toEqual({
      result: 'clean',
      jpeg: jpeg(JFIF, TABLE, frame(512, 512, 0xc2), SCAN, SCAN),
    })
  })

  it('keeps restart markers and stuffed bytes inside a scan', () => {
    const restarts = [...SCAN, 0xff, 0xd0, 0x56, 0xff, 0x00, 0x78]
    const picture = jpeg(JFIF, TABLE, frame(512, 512), restarts)
    expect(cleanPhoto(picture, limits)).toEqual({
      result: 'clean',
      jpeg: picture,
    })
  })

  it('skips fill bytes before a marker', () => {
    const filled = jpeg(JFIF, [0xff, 0xff], TABLE, frame(512, 512), SCAN)
    expect(cleanPhoto(filled, limits).result).toBe('clean')
  })

  it('refuses a JPEG without a scan', () => {
    expect(cleanPhoto(jpeg(JFIF, TABLE, frame(512, 512)), limits).result).toBe(
      'refused',
    )
  })

  it('takes a progressive JPEG', () => {
    const progressive = jpeg(JFIF, TABLE, frame(256, 256, 0xc2), SCAN)
    expect(cleanPhoto(progressive, limits).result).toBe('clean')
  })

  it('refuses a picture that is not square', () => {
    const wide = jpeg(JFIF, TABLE, frame(512, 384), SCAN)
    expect(cleanPhoto(wide, limits).result).toBe('refused')
  })

  it('refuses a picture wider than the side the browser scales to', () => {
    const large = jpeg(JFIF, TABLE, frame(1024, 1024), SCAN)
    expect(cleanPhoto(large, limits).result).toBe('refused')
  })

  it('refuses a file over the size limit', () => {
    expect(
      cleanPhoto(photo(EXIF), { ...limits, photoMaxBytes: 100 }).result,
    ).toBe('refused')
  })

  it('refuses what is not a JPEG', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(cleanPhoto(png, limits).result).toBe('refused')
    expect(cleanPhoto(Buffer.from([0xff, 0xd8]), limits).result).toBe('refused')
  })

  it('refuses a JPEG cut short or without a frame', () => {
    const whole = photo()
    const truncated = Buffer.concat([whole.subarray(0, 30), whole.subarray(-2)])
    expect(cleanPhoto(truncated, limits).result).toBe('refused')
    expect(cleanPhoto(jpeg(JFIF, TABLE, SCAN), limits).result).toBe('refused')
  })

  it('refuses one with something after its end', () => {
    const trailing = Buffer.concat([photo(), Buffer.from('<script>')])
    expect(cleanPhoto(trailing, limits).result).toBe('refused')
  })
})

describe('the photo service', () => {
  function service(): {
    photos: ReturnType<typeof createPhotoService>
    kept: Map<string, StoredPhoto>
  } {
    const kept = new Map<string, StoredPhoto>()
    const photos = createPhotoService({
      limits: () => limits,
      store: {
        get: (memberId) => Promise.resolve(kept.get(memberId) ?? null),
        set: (memberId, bytes) => {
          kept.set(memberId, { jpeg: bytes, updatedAt: new Date(0) })
          return Promise.resolve()
        },
        remove: (memberId) => {
          kept.delete(memberId)
          return Promise.resolve()
        },
      },
    })
    return { photos, kept }
  }

  it('stores only the cleaned photo', async () => {
    const { photos } = service()
    expect(await photos.replace('m-ada', photo(EXIF))).toBe('saved')
    expect((await photos.own('m-ada'))?.jpeg).toEqual(photo())
  })

  it('keeps the photo there was when an upload is refused', async () => {
    const { photos } = service()
    await photos.replace('m-ada', photo())
    const wide = jpeg(JFIF, TABLE, frame(512, 384), SCAN)
    expect(await photos.replace('m-ada', wide)).toBe('refused')
    expect((await photos.own('m-ada'))?.jpeg).toEqual(photo())
  })

  it('removes the photo', async () => {
    const { photos } = service()
    await photos.replace('m-ada', photo())
    await photos.remove('m-ada')
    expect(await photos.own('m-ada')).toBeNull()
  })
})
