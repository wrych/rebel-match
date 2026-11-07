// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { Crop } from '../lib/crop'
import PhotoCropper from './PhotoCropper.vue'

const picture = { width: 4000, height: 3000, close: () => undefined }
const limits = { photoMaxZoom: 4, photoKeyStepPx: 12, photoZoomStep: 0.25 }

function mountCropper(): ReturnType<typeof mount> {
  const cropper = mount(PhotoCropper, {
    props: {
      picture: picture as unknown as ImageBitmap,
      limits,
      busy: false,
    },
  })
  Object.defineProperty(cropper.find('canvas').element, 'clientWidth', {
    value: 300,
  })
  return cropper
}

async function used(cropper: ReturnType<typeof mount>): Promise<Crop> {
  await cropper
    .findAll('button')
    .find((b) => b.text() === 'Use this photo')
    ?.trigger('click')
  const crops = cropper.emitted('use') as [Crop][]
  return crops[crops.length - 1]?.[0] as Crop
}

function pointer(type: string, id: number, x: number, y: number): PointerEvent {
  const event = new Event(type, { bubbles: true }) as PointerEvent
  Object.assign(event, { pointerId: id, clientX: x, clientY: y })
  return event
}

describe('PhotoCropper (R-PROF-6)', () => {
  it('offers the largest centred square first', async () => {
    expect(await used(mountCropper())).toEqual({ x: 500, y: 0, side: 3000 })
  })

  it('moves the picture with a drag', async () => {
    const cropper = mountCropper()
    const canvas = cropper.find('canvas').element
    canvas.setPointerCapture = () => undefined
    canvas.dispatchEvent(pointer('pointerdown', 1, 100, 100))
    canvas.dispatchEvent(pointer('pointermove', 1, 150, 100))
    canvas.dispatchEvent(pointer('pointerup', 1, 150, 100))

    expect(await used(cropper)).toEqual({ x: 0, y: 0, side: 3000 })
  })

  it('zooms with a pinch', async () => {
    const cropper = mountCropper()
    const canvas = cropper.find('canvas').element
    canvas.setPointerCapture = () => undefined
    canvas.dispatchEvent(pointer('pointerdown', 1, 100, 150))
    canvas.dispatchEvent(pointer('pointerdown', 2, 200, 150))
    canvas.dispatchEvent(pointer('pointermove', 2, 300, 150))

    expect((await used(cropper)).side).toBe(1500)
  })

  it('moves with the arrow keys and zooms with plus and minus', async () => {
    const cropper = mountCropper()
    const canvas = cropper.find('canvas')
    await canvas.trigger('keydown', { key: '+' })
    await canvas.trigger('keydown', { key: '+' })
    await canvas.trigger('keydown', { key: '-' })
    await canvas.trigger('keydown', { key: 'ArrowLeft' })

    const crop = await used(cropper)
    expect(crop.side).toBe(2400)
    expect(crop.x).toBeLessThan(800)
  })

  it('zooms with the wheel', async () => {
    const cropper = mountCropper()
    await cropper.find('canvas').trigger('wheel', { deltaY: -100 })

    expect((await used(cropper)).side).toBe(2400)
  })

  it('ignores a sideways wheel or swipe', async () => {
    const cropper = mountCropper()
    await cropper.find('canvas').trigger('wheel', { deltaY: -100 })
    await cropper.find('canvas').trigger('wheel', { deltaX: 40, deltaY: 0 })

    expect((await used(cropper)).side).toBe(2400)
  })

  it('cancels', async () => {
    const cropper = mountCropper()
    await cropper
      .findAll('button')
      .find((b) => b.text() === 'Cancel')
      ?.trigger('click')
    expect(cropper.emitted('cancel')).toHaveLength(1)
  })
})
