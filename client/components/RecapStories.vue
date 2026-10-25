<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createThreeScene, type SceneFactory } from '../network/scene'
import {
  createPlayer,
  frameTicker,
  type Frame,
  type Player,
  type Ticker,
} from '../network/replay'
import type { Recap } from '../lib/recap'
import { day } from '../lib/when'
import { cardOf, RECAP_TITLE, shareText, type Card } from '../recap/card'
import { renderCard, saveCard, shareCard, type SharedVia } from '../recap/share'
import { storyOf, type Beat } from '../recap/story'
import NetworkGraph from './NetworkGraph.vue'

const props = withDefaults(
  defineProps<{
    recap: Recap
    name: string
    storyMs: number
    site: string
    ticker?: Ticker
    scene?: SceneFactory
    render?: (card: Card, site: string) => Promise<File>
  }>(),
  { ticker: () => frameTicker, scene: createThreeScene, render: renderCard },
)
const emit = defineEmits<{ shared: [via: SharedVia]; close: [] }>()

// A press shorter than this is a tap; longer, it held the story (R-RECAP-1).
const TAP_MS = 250
// The share of a story the replay takes to reach the member's own dot.
const ARRIVAL_SHARE = 0.75

const beats = storyOf(props.recap)
const index = ref(0)
const progress = ref(0)
const graph = ref<InstanceType<typeof NetworkGraph> | null>(null)
const card = cardOf(props.recap, props.name)
const cardFile = ref<File | null>(null)
const cardUrl = ref<string | null>(null)
const problem = ref<string | null>(null)
let player: Player | null = null
let pressedAt: number | null = null

const beat = computed<Beat>(() => beats[index.value] ?? { kind: 'card' })
const last = computed(() => index.value === beats.length - 1)
const arrival = computed(() =>
  beat.value.kind === 'joined'
    ? (props.storyMs * ARRIVAL_SHARE) / Math.max(beat.value.at, 0.05)
    : props.storyMs * ARRIVAL_SHARE,
)

function go(to: number): void {
  index.value = Math.min(Math.max(to, 0), beats.length - 1)
}

function onEnd(): void {
  if (!last.value) go(index.value + 1)
}

function onFrame(frame: Frame): void {
  if (beat.value.kind === 'joined' && frame.progress >= beat.value.at)
    graph.value?.pause()
}

function press(): void {
  pressedAt = props.ticker.now()
  player?.pause()
}

function release(event: PointerEvent): void {
  const held = pressedAt === null ? 0 : props.ticker.now() - pressedAt
  pressedAt = null
  if (held < TAP_MS) {
    const width = (event.currentTarget as HTMLElement).clientWidth
    const forward = event.offsetX > width / 3
    if (forward && last.value) return
    go(index.value + (forward ? 1 : -1))
  }
  player?.play()
}

async function prepareCard(): Promise<void> {
  if (cardFile.value !== null) return
  try {
    cardFile.value = await props.render(card, props.site)
    cardUrl.value = URL.createObjectURL(cardFile.value)
  } catch {
    problem.value = 'The card could not be drawn.'
  }
}

async function share(): Promise<void> {
  if (cardFile.value === null) return
  const via = await shareCard(cardFile.value, shareText(card, props.site))
  if (via !== null) emit('shared', via)
}

function save(): void {
  if (cardFile.value !== null) emit('shared', saveCard(cardFile.value))
}

watch(index, () => {
  player?.restart()
  if (beat.value.kind === 'card') void prepareCard()
})

onMounted(() => {
  player = createPlayer({
    durationMs: props.storyMs,
    ticker: props.ticker,
    onProgress: (at) => {
      progress.value = at
    },
    onEnd,
  })
  player.play()
})

onBeforeUnmount(() => {
  player?.stop()
  if (cardUrl.value !== null) URL.revokeObjectURL(cardUrl.value)
})

defineExpose({ index, go, beats })
</script>

<template>
  <Teleport to="body">
    <div class="stories" role="dialog" :aria-label="RECAP_TITLE">
      <div class="bars" aria-hidden="true">
        <span v-for="(each, at) in beats" :key="at" class="segment">
          <span
            class="fill"
            :style="{
              width: `${at < index ? 100 : at === index ? progress * 100 : 0}%`,
            }"
          />
        </span>
      </div>
      <button
        type="button"
        class="close"
        aria-label="Close"
        @click="emit('close')"
      >
        ×
      </button>

      <div
        v-if="beat.kind === 'joined' || beat.kind === 'network'"
        :key="beat.kind"
        class="backdrop"
        aria-hidden="true"
      >
        <NetworkGraph
          ref="graph"
          :timeline="props.recap.timeline"
          :controls="false"
          :stats="false"
          :highlight-self="beat.kind === 'network'"
          :self-name="beat.kind === 'network' ? props.name : null"
          :duration-ms="arrival"
          :scene="props.scene"
          :ticker="props.ticker"
          @frame="onFrame"
        />
      </div>

      <div
        class="taps"
        @pointerdown="press"
        @pointerup="release"
        @pointercancel="release"
      />

      <section class="story" :class="`story-${beat.kind}`" aria-live="polite">
        <template v-if="beat.kind === 'intro'">
          <p class="kicker">The summit is over</p>
          <h1 class="big">{{ RECAP_TITLE }}</h1>
          <p class="line">What you made of it, {{ props.name }}.</p>
        </template>

        <template v-else-if="beat.kind === 'joined'">
          <p class="kicker">Where it started</p>
          <h2 class="big">Rebel no. {{ beat.number }}</h2>
          <p class="line">You joined on {{ day(beat.day) }}.</p>
        </template>

        <template v-else-if="beat.kind === 'row'">
          <p class="kicker">{{ beat.title }}</p>
          <p class="huge">{{ beat.count }}</p>
          <p class="line">{{ beat.counts }}</p>
          <p v-if="beat.level" class="tag">{{ beat.level }}</p>
          <p v-if="beat.compared" class="compare">{{ beat.compared }}</p>
        </template>

        <template v-else-if="beat.kind === 'crowns'">
          <p class="kicker">You lead the movement</p>
          <p v-for="crown in beat.names" :key="crown" class="big crown">
            ♛ {{ crown }}
          </p>
          <p class="line">Nobody did more.</p>
        </template>

        <template v-else-if="beat.kind === 'network'">
          <p class="kicker">Today</p>
          <h2 class="big">{{ beat.members }} rebels</h2>
          <p class="line">And you are one of them.</p>
        </template>

        <template v-else>
          <p class="kicker">Share your record</p>
          <img
            v-if="cardUrl"
            class="card"
            :src="cardUrl"
            :alt="`${RECAP_TITLE}: ${props.name}`"
          />
          <p v-else-if="problem" class="alert" role="alert">{{ problem }}</p>
          <div class="actions">
            <button
              type="button"
              class="btn btn-primary"
              :disabled="!cardFile"
              @click="share"
            >
              Share on LinkedIn
            </button>
            <button
              type="button"
              class="btn btn-ghost"
              :disabled="!cardFile"
              @click="save"
            >
              Save image
            </button>
          </div>
        </template>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.stories {
  --paper: #0b0d14;
  --ink: #f2efe8;
  --muted: #8b90a8;
  --line: #2a2e3d;

  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  overflow: hidden;
  margin: 0 auto;
  max-width: min(100vw, calc(100dvh * 9 / 16));
  background: var(--paper);
  color: var(--ink);
  user-select: none;
}

.bars {
  position: absolute;
  top: 0.8rem;
  left: 0.8rem;
  right: 0.8rem;
  z-index: 3;
  display: flex;
  gap: 0.25rem;
}

.segment {
  flex: 1;
  height: 3px;
  overflow: hidden;
  border-radius: 2px;
  background: rgb(255 255 255 / 25%);
}

.fill {
  display: block;
  height: 100%;
  background: var(--ink);
}

.close {
  position: absolute;
  top: 1.4rem;
  right: 0.8rem;
  z-index: 4;
  border: 0;
  background: none;
  color: var(--ink);
  font-size: 2rem;
  line-height: 1;
  cursor: pointer;
}

.backdrop {
  position: absolute;
  inset: 0;
}

.backdrop :deep(.stage) {
  height: 100dvh;
  border: 0;
  border-radius: 0;
}

.backdrop :deep(.frame) {
  border-radius: 0;
}

.taps {
  position: absolute;
  inset: 0;
  z-index: 1;
}

.story {
  position: relative;
  z-index: 2;
  display: grid;
  align-content: center;
  gap: 0.8rem;
  padding: 4rem 1.6rem 2rem;
  pointer-events: none;
  text-shadow: 0 0.1em 0.6em rgb(0 0 0 / 60%);
}

.story-joined,
.story-network {
  align-content: end;
  padding-bottom: 3rem;
}

.kicker {
  margin: 0;
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 0.85rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.big,
.huge {
  margin: 0;
  font-family: var(--font-display);
  line-height: 1;
  text-transform: uppercase;
}

.big {
  font-size: clamp(2.4rem, 12vw, 3.6rem);
}

.huge {
  color: var(--accent);
  font-size: clamp(6rem, 40vw, 10rem);
}

.line {
  margin: 0;
  font-size: 1.3rem;
  font-weight: 700;
}

.tag {
  justify-self: start;
  margin: 0.4rem 0 0;
  padding: 0.3rem 0.7rem;
  border: 1.5px solid var(--ink);
  border-radius: 999px;
  font-family: var(--font-mono);
  font-size: 0.85rem;
  text-transform: uppercase;
}

.compare {
  margin: 0;
  color: var(--muted);
  font-size: 1rem;
}

.crown {
  color: var(--accent);
}

.card {
  width: 100%;
  max-height: 58dvh;
  object-fit: contain;
  border-radius: var(--radius);
}

.actions {
  display: grid;
  gap: 0.6rem;
  pointer-events: auto;
}

.actions .btn-ghost {
  color: var(--ink);
}
</style>
