<script setup lang="ts">
import { computed } from 'vue'
import type { NetworkTimeline } from '../../src/network/timeline'
import { day as dayOf } from '../lib/when'

const props = defineProps<{
  timeline: NetworkTimeline
  progress: number
  day: string | null
}>()
const emit = defineEmits<{ seek: [progress: number] }>()

const WIDTH = 1000
const STEPS = 1000

// A replay day is a UTC date; read at noon it is the same date everywhere.
const dayLabel = (shown: string | null): string =>
  shown === null ? '' : dayOf(`${shown}T12:00:00Z`)

const joins = computed(() =>
  props.timeline.nodes.map((node) => node.at * WIDTH),
)
const connections = computed(() =>
  props.timeline.links.map((link) => link.at * WIDTH),
)
const first = computed(() => dayLabel(props.timeline.nodes[0]?.day ?? null))
const last = computed(() => {
  const days = [...props.timeline.nodes, ...props.timeline.links].map(
    (event) => event.day,
  )
  return dayLabel(days.sort().at(-1) ?? null)
})
const playhead = computed(() => props.progress * WIDTH)

function seek(event: Event): void {
  emit('seek', Number((event.target as HTMLInputElement).value) / STEPS)
}
</script>

<template>
  <div class="timeline">
    <div class="track">
      <svg
        class="ticks"
        :viewBox="`0 0 ${WIDTH} 24`"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <line
          v-for="(x, index) in connections"
          :key="`l${index}`"
          class="tick tick-link"
          :x1="x"
          :x2="x"
          y1="8"
          y2="16"
        />
        <line
          v-for="(x, index) in joins"
          :key="`n${index}`"
          class="tick tick-node"
          :x1="x"
          :x2="x"
          y1="4"
          y2="20"
        />
        <rect class="played" x="0" y="10" :width="playhead" height="4" />
        <line class="playhead" :x1="playhead" :x2="playhead" y1="0" y2="24" />
      </svg>
      <input
        class="scrub"
        type="range"
        min="0"
        :max="STEPS"
        :value="Math.round(props.progress * STEPS)"
        aria-label="Replay position"
        :aria-valuetext="dayLabel(props.day)"
        @input="seek"
      />
    </div>
    <p class="ends mono">
      <span>{{ first }}</span
      ><span>{{ last }}</span>
    </p>
  </div>
</template>

<style scoped>
.timeline {
  display: grid;
  gap: 0.3rem;
}

.track {
  position: relative;
  height: 2rem;
}

.ticks {
  width: 100%;
  height: 100%;
}

.played {
  fill: var(--accent);
}

.tick {
  stroke: var(--muted);
  opacity: 0.55;
  stroke-width: 1.5;
  vector-effect: non-scaling-stroke;
}

.tick-link {
  opacity: 0.3;
}

.playhead {
  stroke: var(--accent);
  stroke-width: 3;
  vector-effect: non-scaling-stroke;
}

.scrub {
  position: absolute;
  inset: 0;
  width: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}

.track:focus-within {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 4px;
}

.ends {
  display: flex;
  justify-content: space-between;
  margin: 0;
  color: var(--muted);
  font-size: 0.75rem;
}
</style>
