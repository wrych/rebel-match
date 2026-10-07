<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { fetchConfig } from '../lib/api'
import { swipeStep } from '../lib/swipe'

/** One card at a time, browsed by arrow buttons, arrow keys or a swipe
 * (R-OFF-1); the card itself is the default slot. */
const props = defineProps<{ index: number; count: number; noun: string }>()
const emit = defineEmits<{ browse: [index: number] }>()

const swipeMinPx = ref<number | null>(null)
let touchedAt: { x: number; y: number } | null = null

// Without the threshold the card takes no swipes; the arrows still browse.
async function loadSwipeMinPx(): Promise<void> {
  try {
    swipeMinPx.value = (await fetchConfig()).limits.swipeMinPx
  } catch {
    swipeMinPx.value = null
  }
}

function browse(step: -1 | 1): void {
  const next = props.index + step
  if (next < 0 || next >= props.count) return
  emit('browse', next)
}

function onKey(event: KeyboardEvent): void {
  if (event.target instanceof HTMLTextAreaElement) return
  if (event.key === 'ArrowLeft') browse(-1)
  if (event.key === 'ArrowRight') browse(1)
}

function onTouchStart(event: TouchEvent): void {
  const touch = event.touches[0]
  touchedAt =
    event.touches.length === 1 && touch !== undefined
      ? { x: touch.clientX, y: touch.clientY }
      : null
}

function onTouchEnd(event: TouchEvent): void {
  const touch = event.changedTouches[0]
  const from = touchedAt
  touchedAt = null
  if (from === null || touch === undefined || swipeMinPx.value === null) return
  const step = swipeStep(
    from,
    { x: touch.clientX, y: touch.clientY },
    swipeMinPx.value,
  )
  if (step !== 0) browse(step)
}

function onTouchCancel(): void {
  touchedAt = null
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  void loadSwipeMinPx()
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <p class="footnote">
    {{ index + 1 }} of {{ count }} · arrows or ‹ › to browse
  </p>

  <div class="deck">
    <button
      type="button"
      class="deck-arrow"
      :aria-label="`Previous ${noun}`"
      :disabled="index === 0"
      @click="browse(-1)"
    >
      ‹
    </button>
    <article
      class="deck-card"
      aria-live="polite"
      @touchstart.passive="onTouchStart"
      @touchend="onTouchEnd"
      @touchcancel="onTouchCancel"
    >
      <slot />
    </article>
    <button
      type="button"
      class="deck-arrow"
      :aria-label="`Next ${noun}`"
      :disabled="index >= count - 1"
      @click="browse(1)"
    >
      ›
    </button>
  </div>
</template>
