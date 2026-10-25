<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import {
  createPlayer,
  frameTicker,
  type Player,
  type Ticker,
} from '../network/replay'
import { touchScreen, watchLandscape } from '../lib/orientation'
import { stageAt, type StageState } from '../presentation/director'
import {
  createPresentationScene,
  type Anchors,
  type PresentationScene,
} from '../presentation/scene'
import type { PresentationScript } from '../presentation/script'
import { buildWorld, type PresentationData } from '../presentation/world'
import ChallengeCard from './ChallengeCard.vue'
import PresentationLabel from './PresentationLabel.vue'

const props = withDefaults(
  defineProps<{
    data: PresentationData
    script: PresentationScript
    scene?: (
      host: HTMLElement,
      world: ReturnType<typeof buildWorld>,
    ) => PresentationScene
    ticker?: Ticker
  }>(),
  { scene: createPresentationScene, ticker: () => frameTicker },
)

const SEEK_SECONDS = 5
const MS_PER_SECOND = 1000

const root = ref<HTMLElement | null>(null)
const host = ref<HTMLElement | null>(null)
const world = buildWorld(props.data, props.script)
const seconds = ref(0)
const playing = ref(false)
const state = shallowRef<StageState>(stageAt(props.script, world, 0))
const anchors = shallowRef<Anchors>(new Map())
// A phone plays by taps and sideways; an iPhone allows full screen to
// videos only, so it gets no button for it.
const touch = touchScreen()
const { landscape, stop: stopWatching } = watchLandscape()
const canFullScreen = document.fullscreenEnabled === true
let drawn: PresentationScene | null = null
let player: Player | null = null

const length = props.script.length
const clock = (s: number): string =>
  `${String(Math.floor(s / 60))}:${String(Math.floor(s % 60)).padStart(2, '0')}`

function draw(): void {
  state.value = stageAt(props.script, world, seconds.value)
  const named = state.value.labels.map((label) => label.handle)
  anchors.value = drawn?.render(state.value, named) ?? new Map()
}

const labels = computed(() =>
  state.value.labels.flatMap((label) => {
    const member = world.castOf(label.handle)
    const at = anchors.value.get(label.handle) ?? null
    return member === null || at === null
      ? []
      : [{ ...label, name: member.name, photo: member.photo, at }]
  }),
)
const founderNames = computed(() =>
  props.script.founders.handles.map(
    (handle) => world.castOf(handle)?.name ?? 'A founder',
  ),
)

function play(): void {
  player?.play()
  playing.value = player?.playing ?? false
}

function pause(): void {
  player?.pause()
  playing.value = false
}

function toggle(): void {
  if (playing.value) pause()
  else play()
}

function seek(to: number): void {
  player?.seek(Math.min(Math.max(to, 0), length) / length)
}

async function fullScreen(): Promise<void> {
  if (document.fullscreenElement === null) await root.value?.requestFullscreen()
  else await document.exitFullscreen()
}

function onKey(event: KeyboardEvent): void {
  const keys: Record<string, () => void> = {
    ' ': toggle,
    ArrowLeft: () => seek(seconds.value - SEEK_SECONDS),
    ArrowRight: () => seek(seconds.value + SEEK_SECONDS),
    Home: () => seek(0),
    f: fullScreenNow,
  }
  const act = keys[event.key]
  if (act === undefined) return
  event.preventDefault()
  act()
}

onMounted(() => {
  if (host.value !== null) drawn = props.scene(host.value, world)
  player = createPlayer({
    durationMs: length * MS_PER_SECOND,
    ticker: props.ticker,
    onProgress: (progress) => {
      seconds.value = progress * length
      draw()
    },
    onEnd: () => {
      playing.value = false
    },
  })
  window.addEventListener('keydown', onKey)
  draw()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  stopWatching()
  player?.stop()
  drawn?.dispose()
})

function fullScreenNow(): void {
  void fullScreen().catch(() => undefined)
}

defineExpose({ play, pause, seek, seconds, state })
</script>

<template>
  <Teleport to="body">
    <div ref="root" class="theatre">
      <div class="stage" @click="toggle">
        <div ref="host" class="scene" aria-hidden="true" />
        <PresentationLabel
          v-for="label in labels"
          :key="label.handle"
          :name="label.name"
          :photo="label.photo"
          :at="label.at"
          :opacity="label.opacity"
        />
        <div
          class="cards"
          :style="{
            opacity: String(state.parts.cards),
            transform: `translateY(${String((1 - state.parts.cards) * 2)}rem)`,
          }"
        >
          <ChallengeCard
            v-for="(challenge, index) in props.script.founders.challenges"
            :key="index"
            :kicker="founderNames[index] ?? ''"
            :body="challenge"
            :counts="null"
          />
        </div>
        <p
          v-if="state.words"
          class="words"
          :style="{ opacity: String(state.words.opacity) }"
          aria-live="polite"
        >
          <span
            v-for="(span, index) in state.words.spans"
            :key="index"
            :class="{ accent: span.accent, struck: span.struck }"
            >{{ span.text }}</span
          >
        </p>
        <div class="flash" :style="{ opacity: String(state.flash) }" />
        <div v-if="!playing" class="controls" @click.stop>
          <div class="buttons">
            <button
              type="button"
              class="btn btn-primary btn-small"
              @click="play"
            >
              Play
            </button>
            <button
              v-if="canFullScreen"
              type="button"
              class="btn btn-ghost btn-small"
              @click="fullScreenNow"
            >
              Full screen
            </button>
          </div>
          <input
            class="scrub"
            type="range"
            min="0"
            :max="length"
            step="0.1"
            :value="seconds"
            aria-label="Presentation position"
            @input="seek(Number(($event.target as HTMLInputElement).value))"
          />
          <p class="mono help">
            {{ clock(seconds) }} / {{ clock(length) }} ·
            {{
              touch
                ? 'Tap to play or pause'
                : 'Space plays · ← → seek · F full screen · or click'
            }}
          </p>
        </div>
      </div>
      <p v-if="touch && !landscape" class="turn" role="status">
        Turn your phone sideways to watch.
      </p>
    </div>
  </Teleport>
</template>

<style scoped>
.theatre {
  --paper: #0b0d14;
  --ink: #f2efe8;
  --muted: #5b6078;
  --faint: #8b90a8;
  --line: #2a2e3d;
  --line-strong: #3a3f52;
  --card: #f2efe8;
  --card-fg: #111010;
  --card-meta: #6b6659;

  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  background: #000;
}

.stage {
  position: relative;
  width: min(100vw, calc(100vh * 16 / 9));
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background: var(--paper);
  color: var(--ink);
}

.scene,
.scene :deep(canvas) {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.words {
  position: absolute;
  left: 8%;
  right: 8%;
  bottom: 12%;
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(1.5rem, 4.2vw, 4.6rem);
  line-height: 1.1;
  text-align: center;
  text-wrap: balance;
  text-shadow: 0 0.1em 0.6em rgb(0 0 0 / 70%);
}

.accent {
  color: var(--accent);
}

.struck {
  text-decoration: line-through;
  text-decoration-color: var(--accent);
  opacity: 0.6;
}

.cards {
  --ink: #111010;
  --muted: #6b6659;
  --paper: #faf8f4;
  --line: #ded8cc;

  position: absolute;
  left: 6%;
  right: 6%;
  top: 8%;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 30%;
  pointer-events: none;
}

.flash {
  position: absolute;
  inset: 0;
  background: #fff;
  pointer-events: none;
}

.controls {
  position: absolute;
  left: 2rem;
  right: 2rem;
  bottom: 1rem;
  display: grid;
  gap: 0.3rem;
}

.buttons {
  display: flex;
  justify-content: center;
  gap: 0.6rem;
}

.buttons .btn-ghost {
  color: var(--ink);
}

.turn {
  position: absolute;
  inset: auto 1rem 2rem;
  margin: 0;
  padding: 0.8rem 1rem;
  border-radius: var(--radius);
  background: var(--accent);
  color: var(--on-accent);
  font-weight: 700;
  text-align: center;
}

.stage {
  cursor: pointer;
}

.scrub {
  width: 100%;
  accent-color: var(--accent);
}

.help {
  margin: 0;
  color: var(--faint);
  font-size: 0.8rem;
  text-align: center;
}
</style>
