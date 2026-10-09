<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  shallowRef,
} from 'vue'
import { fetchConfig } from '../lib/api'
import {
  cardMotion,
  cardPose,
  dragAxis,
  flyOutX,
  slideInX,
  swipeStep,
  type CardPose,
} from '../lib/swipe'

/** One card at a time, browsed by arrow buttons, arrow keys or a swipe; the
 * card follows the finger and flies off unless motion is reduced (R-OFF-1).
 * The card itself is the default slot. */
const props = defineProps<{ index: number; count: number; noun: string }>()
const emit = defineEmits<{ browse: [index: number] }>()

type Point = { x: number; y: number }

const REST: CardPose = { x: 0, rotateDeg: 0 }

const swipeMinPx = ref<number | null>(null)
const card = ref<HTMLElement | null>(null)
const pose = shallowRef<CardPose>(REST)
const moveMs = ref(0)
let drag: { from: Point; axis: 'x' | 'y' | null } | null = null
let flight: ReturnType<typeof setTimeout> | undefined

const cardStyle = computed(() => ({
  transform:
    pose.value.x === 0 && pose.value.rotateDeg === 0
      ? undefined
      : `translateX(${pose.value.x}px) rotate(${pose.value.rotateDeg}deg)`,
  transition: moveMs.value > 0 ? `transform ${moveMs.value}ms ease-out` : '',
}))

// Without the threshold the card takes no swipes; the arrows still browse.
async function loadSwipeMinPx(): Promise<void> {
  try {
    swipeMinPx.value = (await fetchConfig()).limits.swipeMinPx
  } catch {
    swipeMinPx.value = null
  }
}

// An unknown preference counts as reduced: no motion is the safe side.
function still(): boolean {
  return (
    typeof window.matchMedia !== 'function' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function move(to: CardPose, ms: number): void {
  pose.value = to
  moveMs.value = ms
}

function canBrowse(step: -1 | 1): boolean {
  const next = props.index + step
  return flight === undefined && next >= 0 && next < props.count
}

function browse(step: -1 | 1): void {
  if (!canBrowse(step)) return
  const next = props.index + step
  if (still()) {
    emit('browse', next)
    return
  }
  const deck = { index: props.index, count: props.count }
  move(cardPose(flyOutX(step, window.innerWidth)), cardMotion.flyOutMs)
  flight = setTimeout(() => void arrive(step, deck), cardMotion.flyOutMs)
}

// A deck the parent changed mid-flight, by an answer say, already shows the
// card that belongs there; browsing on from the old place would skip one.
async function arrive(
  step: -1 | 1,
  deck: { index: number; count: number },
): Promise<void> {
  if (props.index === deck.index && props.count === deck.count)
    emit('browse', deck.index + step)
  move({ x: slideInX(step, window.innerWidth), rotateDeg: 0 }, 0)
  await nextTick()
  // Reading layout commits the start pose, so the slide in has a from.
  card.value?.getBoundingClientRect()
  move(REST, cardMotion.slideInMs)
  flight = undefined
}

function springBack(): void {
  if (flight === undefined && pose.value !== REST)
    move(REST, cardMotion.springBackMs)
}

function onKey(event: KeyboardEvent): void {
  if (event.target instanceof HTMLTextAreaElement) return
  if (event.key === 'ArrowLeft') browse(-1)
  if (event.key === 'ArrowRight') browse(1)
}

function pointOf(touch: Touch): Point {
  return { x: touch.clientX, y: touch.clientY }
}

function onTouchStart(event: TouchEvent): void {
  const touch = event.touches[0]
  drag =
    event.touches.length === 1 && touch !== undefined && flight === undefined
      ? { from: pointOf(touch), axis: null }
      : null
}

function onTouchMove(event: TouchEvent): void {
  const touch = event.touches[0]
  if (drag === null || touch === undefined || swipeMinPx.value === null) return
  if (still()) return
  const to = pointOf(touch)
  drag.axis ??= dragAxis(drag.from, to, cardMotion.axisLockPx)
  if (drag.axis === 'x') move(cardPose(to.x - drag.from.x), 0)
}

function onTouchEnd(event: TouchEvent): void {
  const touch = event.changedTouches[0]
  const from = drag?.from
  drag = null
  const step =
    from === undefined || touch === undefined || swipeMinPx.value === null
      ? 0
      : swipeStep(from, pointOf(touch), swipeMinPx.value)
  if (step !== 0 && canBrowse(step)) browse(step)
  else springBack()
}

function onTouchCancel(): void {
  drag = null
  springBack()
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  void loadSwipeMinPx()
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  clearTimeout(flight)
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
      ref="card"
      class="deck-card"
      aria-live="polite"
      :style="cardStyle"
      @touchstart.passive="onTouchStart"
      @touchmove.passive="onTouchMove"
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
