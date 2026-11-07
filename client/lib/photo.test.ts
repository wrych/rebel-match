import { afterEach, describe, expect, it, vi } from 'vitest'
import { centreSquare, ownPhotoUrl, removePhoto, savePhoto } from './photo'

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

describe('centreSquare', () => {
  it('takes the middle of a landscape picture', () => {
    expect(centreSquare(4000, 3000)).toEqual({ x: 500, y: 0, side: 3000 })
  })

  it('takes the middle of a portrait picture', () => {
    expect(centreSquare(3000, 4001)).toEqual({ x: 0, y: 500, side: 3000 })
  })

  it('takes a square picture whole', () => {
    expect(centreSquare(512, 512)).toEqual({ x: 0, y: 0, side: 512 })
  })
})

describe('the photo requests (R-PROF-5)', () => {
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
