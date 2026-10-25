<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import type { NetworkTimeline } from '../../src/network/timeline'
import { prefersReducedMotion } from '../lib/intro'
import { layout } from '../network/layout'
import {
  createPlayer,
  frameAt,
  frameTicker,
  type Frame,
  type Player,
  type Ticker,
} from '../network/replay'
import {
  createThreeScene,
  type NetworkScene,
  type SceneFactory,
} from '../network/scene'
import NetworkTimelineBar from './NetworkTimelineBar.vue'

/** How long the whole replay plays, before the camera turns to the viewer. */
const REPLAY_MS = 24_000

const props = withDefaults(
  defineProps<{
    timeline: NetworkTimeline
    /** Turn to the viewer's own point once the replay ends (R-NET-2). */
    highlightSelf?: boolean
    autoplay?: boolean
    /** The timeline bar and the play buttons; a presentation may drive the
     * graph through what it exposes instead. */
    controls?: boolean
    durationMs?: number
    scene?: SceneFactory
    ticker?: Ticker
  }>(),
  {
    highlightSelf: true,
    autoplay: true,
    controls: true,
    durationMs: REPLAY_MS,
    scene: createThreeScene,
    ticker: () => frameTicker,
  },
)
const emit = defineEmits<{ frame: [frame: Frame]; end: [] }>()

const host = ref<HTMLElement | null>(null)
const frame = ref<Frame>(frameAt(props.timeline, 0))
const ended = ref(false)
const playing = ref(false)
const drawn = shallowRef<NetworkScene | null>(null)
let player: Player | null = null

const description = computed(
  () =>
    `The network: ${frame.value.nodes} members, ${frame.value.links} connections`,
)
const hasSelf = computed(() => props.timeline.nodes.some((node) => node.self))

function finish(): void {
  if (ended.value) return
  ended.value = true
  playing.value = false
  drawn.value?.highlight(props.highlightSelf && hasSelf.value)
  emit('end')
}

function show(progress: number): void {
  frame.value = frameAt(props.timeline, progress)
  if (progress < 1 && ended.value) {
    ended.value = false
    drawn.value?.highlight(false)
  }
  drawn.value?.show(frame.value)
  emit('frame', frame.value)
}

function play(): void {
  player?.play()
  playing.value = player?.playing ?? false
}

function pause(): void {
  player?.pause()
  playing.value = false
}

function restart(): void {
  player?.restart()
  playing.value = player?.playing ?? false
}

function seek(progress: number): void {
  if (progress >= 1) pause()
  player?.seek(progress)
  if (progress >= 1) finish()
}

onMounted(() => {
  const still = prefersReducedMotion()
  if (host.value !== null)
    drawn.value = props.scene(
      host.value,
      props.timeline,
      layout(props.timeline.nodes.length, props.timeline.links),
      { still },
    )
  player = createPlayer({
    durationMs: props.durationMs,
    ticker: props.ticker,
    onProgress: show,
    onEnd: finish,
  })
  if (still) seek(1)
  else if (props.autoplay) play()
  else show(0)
})

onBeforeUnmount(() => {
  player?.stop()
  drawn.value?.dispose()
})

defineExpose({ play, pause, restart, seek, frame, ended })
</script>

<template>
  <div class="graph">
    <div ref="host" class="stage" role="img" :aria-label="description" />
    <div v-if="props.controls" class="controls">
      <NetworkTimelineBar
        :timeline="props.timeline"
        :progress="frame.progress"
        :day="frame.day"
        @seek="seek"
      />
      <div class="buttons">
        <button
          v-if="playing"
          type="button"
          class="btn btn-ghost btn-small"
          @click="pause"
        >
          Pause
        </button>
        <button
          v-else-if="!ended"
          type="button"
          class="btn btn-ghost btn-small"
          @click="play"
        >
          Play
        </button>
        <button type="button" class="btn btn-ghost btn-small" @click="restart">
          Replay
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.graph {
  display: grid;
  gap: 0.8rem;
}

.stage {
  position: relative;
  height: min(70vh, 32rem);
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  touch-action: none;
}

.stage :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}

.controls {
  display: grid;
  gap: 0.6rem;
}

.buttons {
  display: flex;
  gap: 0.5rem;
}
</style>
