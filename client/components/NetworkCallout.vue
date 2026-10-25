<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import type { SelfStats } from '../lib/network'

const props = defineProps<{
  name: string | null
  stats: SelfStats
  at: { x: number; y: number }
  stage: { width: number; height: number }
}>()

// The card sits over the point, or under it in the upper part, centred on
// it and moved in from the stage's sides so it is never cut off.
const UPPER_SHARE = 0.4
const EDGE_PX = 8
const card = ref<HTMLElement | null>(null)
const cardWidth = ref(0)
watchEffect(() => {
  cardWidth.value = card.value?.offsetWidth ?? 0
})
const below = computed(() => props.at.y < props.stage.height * UPPER_SHARE)
const place = computed(() => ({
  left: `${String(props.at.x)}px`,
  top: `${String(props.at.y)}px`,
}))
const shift = computed(() => {
  const widest = props.stage.width - cardWidth.value - EDGE_PX
  const left = Math.min(
    Math.max(props.at.x - cardWidth.value / 2, EDGE_PX),
    Math.max(widest, EDGE_PX),
  )
  return { left: `${String(left - props.at.x)}px` }
})
</script>

<template>
  <div
    class="callout"
    :class="{ below }"
    :style="place"
    role="status"
    aria-live="polite"
  >
    <span class="pointer" aria-hidden="true" />
    <div ref="card" class="card" :style="shift">
      <p class="you mono">That’s you</p>
      <p class="who">{{ props.name ?? 'You' }}</p>
      <dl class="mono">
        <div>
          <dt>Connections</dt>
          <dd>
            {{ props.stats.connections
            }}<span v-if="props.stats.hidden" class="star">*</span>
          </dd>
        </div>
        <div>
          <dt>Challenges</dt>
          <dd>{{ props.stats.challenges }}</dd>
        </div>
      </dl>
      <p class="joined">
        Joined <span class="mono">{{ props.stats.joined }}</span>
      </p>
    </div>
  </div>
</template>

<style scoped>
.callout {
  position: absolute;
  pointer-events: none;
}

.pointer {
  position: absolute;
  left: 0;
  bottom: 0.6rem;
  height: 1.2rem;
  border-left: 1.5px solid var(--accent);
}

.card {
  position: absolute;
  bottom: 1.8rem;
  min-width: 10rem;
  padding: 0.55rem 0.75rem;
  border: 1.5px solid var(--accent);
  border-radius: var(--radius);
  background: var(--paper);
  box-shadow: var(--tiny-shadow);
}

.below .pointer {
  top: 0.6rem;
  bottom: auto;
}

.below .card {
  top: 1.8rem;
  bottom: auto;
}

.who {
  margin: 0 0 0.35rem;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.you {
  margin: 0 0 0.1rem;
  color: var(--accent);
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

dl {
  display: grid;
  gap: 0.1rem;
  margin: 0;
  font-size: 0.75rem;
}

dl div {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}

dt {
  color: var(--muted);
}

dd {
  margin: 0;
  font-weight: 700;
  white-space: nowrap;
}

.joined {
  margin: 0.35rem 0 0;
  font-size: 0.75em;
  color: var(--muted);
  text-align: right;
}

.star {
  color: var(--accent);
}
</style>
