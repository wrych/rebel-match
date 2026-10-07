<script setup lang="ts">
import { ref } from 'vue'
import type { Spot } from './core/floors'

/** A joystick wherever the left thumb lands (R-GAME-12): the further from
 * where it landed, the faster, up to the rim. */
const emit = defineEmits<{ move: [direction: Spot] }>()

const RIM_PX = 48
const origin = ref<Spot | null>(null)
const knob = ref<Spot>({ x: 0, y: 0 })
let pointer: number | null = null

function aim(event: PointerEvent): void {
  if (origin.value === null) return
  const dx = event.clientX - origin.value.x
  const dy = event.clientY - origin.value.y
  const length = Math.hypot(dx, dy)
  const scale = length > RIM_PX ? RIM_PX / length : 1
  knob.value = { x: dx * scale, y: dy * scale }
  emit('move', { x: knob.value.x / RIM_PX, y: knob.value.y / RIM_PX })
}

function down(event: PointerEvent): void {
  if (pointer !== null) return
  pointer = event.pointerId
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
  origin.value = { x: event.clientX, y: event.clientY }
  knob.value = { x: 0, y: 0 }
}

function move(event: PointerEvent): void {
  if (event.pointerId === pointer) aim(event)
}

function up(event: PointerEvent): void {
  if (event.pointerId !== pointer) return
  pointer = null
  origin.value = null
  emit('move', { x: 0, y: 0 })
}
</script>

<template>
  <div
    class="pad"
    aria-hidden="true"
    @pointerdown="down"
    @pointermove="move"
    @pointerup="up"
    @pointercancel="up"
  >
    <div
      v-if="origin"
      class="base"
      :style="{ left: `${origin.x}px`, top: `${origin.y}px` }"
    >
      <div
        class="knob"
        :style="{ transform: `translate(${knob.x}px, ${knob.y}px)` }"
      />
    </div>
  </div>
</template>

<style scoped>
.pad {
  position: absolute;
  inset: 0 50% 0 0;
  touch-action: none;
}

.base {
  position: fixed;
  width: 96px;
  height: 96px;
  margin: -48px 0 0 -48px;
  border-radius: 50%;
  background: rgb(0 0 0 / 15%);
  display: grid;
  place-items: center;
}

.knob {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgb(0 0 0 / 35%);
}
</style>
