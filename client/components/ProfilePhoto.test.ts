// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ProfilePhoto from './ProfilePhoto.vue'

const limits = { savedTickMs: 2500, photoSidePx: 512, photoJpegQuality: 0.85 }
const drawn: unknown[][] = []

function browserDraws(): void {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(() => Promise.resolve({ width: 4000, height: 3000, close: vi.fn() })),
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: (...args: unknown[]) => drawn.push(args),
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
    (callback) => {
      callback(new Blob(['jpeg'], { type: 'image/jpeg' }))
    },
  )
}

function answering(status: number): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(() =>
    Promise.resolve({ ok: status < 300, status } as Response),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function mountPhoto(photoAt: string | null = null): ReturnType<typeof mount> {
  return mount(ProfilePhoto, {
    props: { name: 'Ada Rebel', photoAt, limits },
  })
}

async function choose(screen: ReturnType<typeof mount>): Promise<void> {
  const input = screen.find('input[type="file"]')
  const file = new File(['raw'], 'me.heic', { type: 'image/heic' })
  Object.defineProperty(input.element, 'files', { value: [file] })
  await input.trigger('change')
  await flushPromises()
}

beforeEach(() => {
  drawn.length = 0
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ProfilePhoto (R-PROF-5)', () => {
  it('shows initials without a photo, and says only the member sees it', () => {
    const screen = mountPhoto()
    expect(screen.text()).toContain('AR')
    expect(screen.find('img').exists()).toBe(false)
    expect(screen.text()).toContain('Only you see your photo')
    expect(screen.text()).not.toContain('Remove photo')
  })

  it('shows the photo there is', () => {
    const screen = mountPhoto('2026-11-07T10:00:00.000Z')
    expect(screen.find('img').attributes('src')).toContain(
      '/api/profile/photo?v=',
    )
    expect(screen.text()).toContain('Change photo')
  })

  it('crops the centre square, scales it down, uploads it and ticks', async () => {
    browserDraws()
    const fetchMock = answering(204)
    const screen = mountPhoto()

    await choose(screen)

    expect(drawn[0]?.slice(1)).toEqual([500, 0, 3000, 3000, 0, 0, 512, 512])
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/profile/photo',
      expect.objectContaining({ method: 'PUT' }),
    )
    expect(screen.find('img').exists()).toBe(true)
    expect(screen.find('[role="status"]').text()).toContain('Saved')
    expect(screen.find('[role="alert"]').exists()).toBe(false)
  })

  it('says so when the browser cannot read the picture, sending nothing', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => Promise.reject(new Error('undecodable'))),
    )
    const fetchMock = answering(204)
    const screen = mountPhoto()

    await choose(screen)

    expect(screen.find('[role="alert"]').text()).toContain('could not be read')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps the photo there was when the server refuses the new one', async () => {
    browserDraws()
    answering(400)
    const screen = mountPhoto('2026-11-07T10:00:00.000Z')
    const before = screen.find('img').attributes('src')

    await choose(screen)

    expect(screen.find('[role="alert"]').text()).toContain('could not be used')
    expect(screen.find('img').attributes('src')).toBe(before)
  })

  it('says a failed save did not save', async () => {
    browserDraws()
    answering(500)
    const screen = mountPhoto()

    await choose(screen)

    expect(screen.find('[role="alert"]').text()).toContain('did not save')
    expect(screen.find('img').exists()).toBe(false)
  })

  it('removes the photo', async () => {
    const fetchMock = answering(204)
    const screen = mountPhoto('2026-11-07T10:00:00.000Z')

    await screen
      .findAll('button')
      .find((b) => b.text() === 'Remove photo')
      ?.trigger('click')
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith('/api/profile/photo', {
      method: 'DELETE',
    })
    expect(screen.find('img').exists()).toBe(false)
  })
})
