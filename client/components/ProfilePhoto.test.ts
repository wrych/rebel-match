// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ProfilePhoto from './ProfilePhoto.vue'

const limits = {
  savedTickMs: 2500,
  photoSidePx: 512,
  photoJpegQuality: 0.85,
  photoMaxZoom: 4,
  photoKeyStepPx: 12,
  photoZoomStep: 0.25,
}
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

async function button(
  screen: ReturnType<typeof mount>,
  text: string,
): Promise<void> {
  await screen
    .findAll('button')
    .find((b) => b.text() === text)
    ?.trigger('click')
  await flushPromises()
}

async function chooseAndUse(screen: ReturnType<typeof mount>): Promise<void> {
  await choose(screen)
  await button(screen, 'Use this photo')
}

beforeEach(() => {
  drawn.length = 0
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ProfilePhoto (R-PROF-5)', () => {
  it('shows initials without a photo, and says where it is shown', () => {
    const screen = mountPhoto()
    expect(screen.text()).toContain('AR')
    expect(screen.find('img').exists()).toBe(false)
    expect(screen.text()).toContain(
      'Other members see your photo beside your name',
    )
    expect(screen.text()).not.toContain('Remove photo')
  })

  it('shows the photo there is', () => {
    const screen = mountPhoto('2026-11-07T10:00:00.000Z')
    expect(screen.find('img').attributes('src')).toContain(
      '/api/profile/photo?v=',
    )
    expect(screen.text()).toContain('Change photo')
  })

  it('lets the member frame the picture before anything is sent', async () => {
    browserDraws()
    const fetchMock = answering(204)
    const screen = mountPhoto()

    await choose(screen)

    expect(screen.find('input[type="range"]').exists()).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends the framed square, scaled down, and ticks', async () => {
    browserDraws()
    const fetchMock = answering(204)
    const screen = mountPhoto()

    await choose(screen)
    await screen.find('input[type="range"]').setValue('2')
    await button(screen, 'Use this photo')

    const sent = drawn.find((args) => args[7] === 512)?.slice(1)
    expect(sent).toEqual([1250, 750, 1500, 1500, 0, 0, 512, 512])
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/profile/photo',
      expect.objectContaining({ method: 'PUT' }),
    )
    expect(screen.find('input[type="range"]').exists()).toBe(false)
    expect(screen.find('img').exists()).toBe(true)
    expect(screen.find('[role="status"]').text()).toContain('Saved')
    expect(screen.find('[role="alert"]').exists()).toBe(false)
  })

  it('cancels framing without sending anything', async () => {
    browserDraws()
    const fetchMock = answering(204)
    const screen = mountPhoto()

    await choose(screen)
    await button(screen, 'Cancel')

    expect(screen.find('input[type="range"]').exists()).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.text()).toContain('Add a photo')
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

    await chooseAndUse(screen)
    await button(screen, 'Cancel')

    expect(screen.find('[role="alert"]').text()).toContain('could not be used')
    expect(screen.find('img').attributes('src')).toBe(before)
  })

  it('says a failed save did not save', async () => {
    browserDraws()
    answering(500)
    const screen = mountPhoto()

    await chooseAndUse(screen)

    expect(screen.find('[role="alert"]').text()).toContain('did not save')
    expect(screen.find('img').exists()).toBe(false)
  })

  it('removes the photo', async () => {
    const fetchMock = answering(204)
    const screen = mountPhoto('2026-11-07T10:00:00.000Z')

    await button(screen, 'Remove photo')

    expect(fetchMock).toHaveBeenCalledWith('/api/profile/photo', {
      method: 'DELETE',
    })
    expect(screen.find('img').exists()).toBe(false)
  })
})
