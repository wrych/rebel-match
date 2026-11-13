<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import RebelMark from './RebelMark.vue'
import { prefersReducedMotion } from '../lib/intro'

/** The mark before the words of a button that connects two members: at rest,
 * and playing the Rs' meeting while the button is hovered or pressed
 * (R-LOOK-7). */

const root = ref<HTMLElement | null>(null)
const playing = ref(false)
let hovered = false
let pressed = false
let button: HTMLElement | null = null

function disabled(): boolean {
  return (
    button === null ||
    button.matches(':disabled') ||
    button.getAttribute('aria-disabled') === 'true'
  )
}

function start(): void {
  if (!disabled() && !prefersReducedMotion()) playing.value = true
}

// A round ends with the Rs apart again, so stopping there never snaps.
function roundEnded(): void {
  if (disabled() || (!hovered && !pressed)) playing.value = false
}

const listeners: [string, (event: Event) => void][] = [
  [
    'pointerenter',
    () => {
      hovered = true
      start()
    },
  ],
  [
    'pointerleave',
    () => {
      hovered = false
      pressed = false
    },
  ],
  [
    'pointerdown',
    () => {
      pressed = true
      start()
    },
  ],
  ['pointerup', () => (pressed = false)],
  ['pointercancel', () => (pressed = false)],
  [
    'keydown',
    (event: Event) => {
      if (['Enter', ' '].includes((event as KeyboardEvent).key)) start()
    },
  ],
]

onMounted(() => {
  button = root.value?.closest<HTMLElement>('a, button') ?? null
  listeners.forEach(([type, listener]) =>
    button?.addEventListener(type, listener),
  )
})

onBeforeUnmount(() => {
  listeners.forEach(([type, listener]) =>
    button?.removeEventListener(type, listener),
  )
})
</script>

<template>
  <span ref="root" class="connect-mark" @animationiteration="roundEnded">
    <RebelMark :play="playing" repeat bare />
  </span>
</template>

<style scoped>
.connect-mark {
  position: absolute;
  top: 50%;
  left: 1.6em;
  width: 2.3em;
  transform: translateY(-50%);
}

.connect-mark :deep(.rebel-mark) {
  width: 100%;
  height: auto;
}
</style>
