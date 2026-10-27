<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { prefersReducedMotion } from '../lib/intro'
import { frameTicker, type Ticker } from '../network/replay'
import {
  CARD_SIZE,
  markPath,
  paintGround,
  paintWords,
  type Card,
} from '../recap/card'
import type { Halo } from '../recap/halo'
import { cardCanvas, cardPalette } from '../recap/share'

const props = withDefaults(
  defineProps<{
    card: Card
    site: string
    /** The member's surroundings turned to an angle, in radians. */
    halo: (angle: number) => Halo | null
    /** Where it starts, and where it stays for a reader who asks for less
     * motion: the shared image's own angle. */
    angle: number
    ticker?: Ticker
  }>(),
  { ticker: () => frameTicker },
)

// One turn in about a minute: alive, never busy (R-RECAP-5).
const TURN_PER_MS = (Math.PI * 2) / 60_000

const canvas = ref<HTMLCanvasElement | null>(null)
let cancel: (() => void) | null = null

onMounted(async () => {
  const pen = canvas.value?.getContext('2d') ?? null
  if (pen === null) return
  const palette = await cardPalette()
  const words = cardCanvas()
  paintWords(words.pen, props.card, palette, props.site, markPath())
  const draw = (angle: number): void => {
    paintGround(pen, palette, props.halo(angle))
    pen.drawImage(words.canvas, 0, 0)
  }
  draw(props.angle)
  if (prefersReducedMotion()) return
  const start = props.ticker.now()
  const step = (): void => {
    draw(props.angle + (props.ticker.now() - start) * TURN_PER_MS)
    cancel = props.ticker.next(step)
  }
  cancel = props.ticker.next(step)
})

onBeforeUnmount(() => {
  cancel?.()
})
</script>

<template>
  <canvas
    ref="canvas"
    class="card"
    :width="CARD_SIZE.width"
    :height="CARD_SIZE.height"
    role="img"
    :aria-label="`${props.card.title}: ${props.card.name}`"
  />
</template>

<style scoped>
.card {
  display: block;
  width: 100%;
  max-height: 58dvh;
  object-fit: contain;
  border-radius: var(--radius);
}
</style>
