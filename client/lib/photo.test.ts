import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  memberPhotoUrl,
  ownPhoto,
  ownPhotoUrl,
  photoSrc,
  removePhoto,
  savePhoto,
} from './photo'

afterEach(() => {
  vi.unstubAllGlobals()
})

function answering(status: number): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(() =>
    Promise.resolve({ ok: status < 300, status } as Response),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('the photo requests (R-PROF-6)', () => {
  it('sends the JPEG itself', async () => {
    const fetchMock = answering(204)
    const jpeg = new Blob(['x'], { type: 'image/jpeg' })

    expect(await savePhoto(jpeg)).toBe('saved')
    expect(fetchMock).toHaveBeenCalledWith('/api/profile/photo', {
      method: 'PUT',
      headers: { 'content-type': 'image/jpeg' },
      body: jpeg,
    })
  })

  it.each([400, 413])('reads %i as refused', async (status) => {
    answering(status)
    expect(await savePhoto(new Blob(['x']))).toBe('refused')
  })

  it('throws on any other failure, so it is never shown as saved', async () => {
    answering(500)
    await expect(savePhoto(new Blob(['x']))).rejects.toThrow('photo not saved')
  })

  it('removes, and throws when it did not happen', async () => {
    answering(204)
    await removePhoto()
    answering(404)
    await expect(removePhoto()).rejects.toThrow('photo not removed')
  })

  it('gives each version of the photo its own address', () => {
    expect(ownPhotoUrl('2026-11-07T10:00:00.000Z')).toBe(
      '/api/profile/photo?v=2026-11-07T10%3A00%3A00.000Z',
    )
  })
})

describe('photo addresses (R-PROF-7)', () => {
  it('reads a card’s photo by its key, and none without one', () => {
    expect(photoSrc('abc')).toBe('/api/photos/abc')
    expect(photoSrc(null)).toBeNull()
  })

  it('reads a member’s photo for the host tools by id, anew per photo', () => {
    expect(memberPhotoUrl('m-1', 'k')).toBe('/api/admin/members/m-1/photo?v=k')
  })
})

describe('ownPhoto (R-NET-2)', () => {
  function serving(profilePhotos: number, photoAt: string | null): void {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve(
              url === '/api/config'
                ? { limits: { profilePhotos } }
                : { photoAt },
            ),
        }),
      ),
    )
  }

  it('is the member’s own photo while photos are on', async () => {
    serving(1, '2026-11-07T10:00:00.000Z')
    expect(await ownPhoto()).toBe(ownPhotoUrl('2026-11-07T10:00:00.000Z'))
  })

  it.each([
    ['photos are off', 0, '2026-11-07T10:00:00.000Z'],
    ['there is no photo', 1, null],
  ])('is none while %s', async (_name, on, photoAt) => {
    serving(on, photoAt)
    expect(await ownPhoto()).toBeNull()
  })
})
