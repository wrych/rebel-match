<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import type { ClientConfig } from '../lib/api'
import {
  cropOf,
  framingOf,
  panned,
  zoomed,
  type Crop,
  type Framing,
} from '../lib/crop'

const props = defineProps<{
  picture: ImageBitmap
  limits: Pick<
    ClientConfig['limits'],
    'photoMaxZoom' | 'photoKeyStepPx' | 'photoZoomStep'
  >
  busy: boolean
}>()
const emit = defineEmits<{ use: [crop: Crop]; cancel: [] }>()

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [1, 0],
  ArrowRight: [-1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
}

const frame = ref<HTMLCanvasElement | null>(null)
const framing = ref<Framing>(framingOf(props.picture))
const pointers = new Map<number, { x: number; y: number }>()
let pinchFrom: { distance: number; zoom: number } | null = null

function draw(): void {
  const canvas = frame.value
  const context = canvas?.getContext('2d')
  if (!canvas || !context) return
  const px = Math.round(canvas.clientWidth * window.devicePixelRatio)
  canvas.width = px
  canvas.height = px
  const crop = cropOf(props.picture, framing.value)
  context.drawImage(
    props.picture,
    crop.x,
    crop.y,
    crop.side,
    crop.side,
    0,
    0,
    px,
    px,
  )
}

onMounted(draw)
watch(framing, draw)

function move(dx: number, dy: number): void {
  const framePx = Math.max(frame.value?.clientWidth ?? 0, 1)
  framing.value = panned(props.picture, framing.value, { dx, dy, framePx })
}

function zoomTo(zoom: number): void {
  framing.value = zoomed(
    props.picture,
    framing.value,
    zoom,
    props.limits.photoMaxZoom,
  )
}

function spread(): number {
  const [a, b] = [...pointers.values()]
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
}

function down(event: PointerEvent): void {
  frame.value?.setPointerCapture(event.pointerId)
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  pinchFrom =
    pointers.size === 2
      ? { distance: spread(), zoom: framing.value.zoom }
      : null
}

function dragged(event: PointerEvent): void {
  const last = pointers.get(event.pointerId)
  if (last === undefined) return
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  if (pinchFrom !== null && pinchFrom.distance > 0)
    zoomTo((pinchFrom.zoom * spread()) / pinchFrom.distance)
  else move(event.clientX - last.x, event.clientY - last.y)
}

function up(event: PointerEvent): void {
  pointers.delete(event.pointerId)
  pinchFrom = null
}

function zoomBy(steps: number): void {
  zoomTo(framing.value.zoom + steps * props.limits.photoZoomStep)
}

function wheel(event: WheelEvent): void {
  if (event.deltaY !== 0) zoomBy(event.deltaY < 0 ? 1 : -1)
}

function key(event: KeyboardEvent): void {
  const arrow = ARROWS[event.key]
  const px = props.limits.photoKeyStepPx
  if (arrow !== undefined) move(arrow[0] * px, arrow[1] * px)
  else if (event.key === '+' || event.key === '=') zoomBy(1)
  else if (event.key === '-') zoomBy(-1)
  else return
  event.preventDefault()
}

function slid(event: Event): void {
  zoomTo(Number((event.target as HTMLInputElement).value))
}
</script>

<template>
  <div class="stack-tight cropper">
    <div class="frame">
      <canvas
        ref="frame"
        class="picture"
        tabindex="0"
        role="img"
        aria-label="Your photo as it will be cropped. Drag or use the arrow keys to move it."
        @pointerdown="down"
        @pointermove="dragged"
        @pointerup="up"
        @pointercancel="up"
        @wheel.prevent="wheel"
        @keydown="key"
      />
      <span class="ring" aria-hidden="true" />
    </div>
    <label class="zoom">
      <span class="label">Zoom</span>
      <input
        type="range"
        min="1"
        :max="props.limits.photoMaxZoom"
        step="0.01"
        :value="framing.zoom"
        @input="slid"
      />
    </label>
    <p class="small">Drag to move, pinch or slide to zoom.</p>
    <div class="actions">
      <button
        type="button"
        class="btn btn-primary btn-small"
        :disabled="props.busy"
        @click="emit('use', cropOf(props.picture, framing))"
      >
        Use this photo
      </button>
      <button
        type="button"
        class="btn btn-ghost btn-small"
        :disabled="props.busy"
        @click="emit('cancel')"
      >
        Cancel
      </button>
    </div>
  </div>
</template>

<style scoped>
.frame {
  position: relative;
  width: min(100%, 18rem);
  aspect-ratio: 1;
}

.picture {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 0.5rem;
  cursor: grab;
  touch-action: none;
  background: var(--line);
}

.picture:active {
  cursor: grabbing;
}

.picture:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 3px;
}

.ring {
  position: absolute;
  inset: 0;
  border-radius: 0.5rem;
  pointer-events: none;
  background: radial-gradient(
    circle closest-side,
    transparent 99%,
    color-mix(in srgb, var(--paper) 65%, transparent) 100%
  );
}

.zoom {
  display: grid;
  gap: 0.25rem;
  width: min(100%, 18rem);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
</style>
