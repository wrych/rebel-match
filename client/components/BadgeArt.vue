<script setup lang="ts">
import { computed } from 'vue'
import type { CountedRow } from '../../src/badges/rows'
import type { Tier } from '../lib/badges'

const props = withDefaults(
  defineProps<{ row: CountedRow; tier: Tier; size?: number }>(),
  { size: 72 },
)

const RAYS = 24
const SEAL_POINTS = 32
const CENTRE = 50

function polar(radius: number, angle: number): string {
  return `${(CENTRE + radius * Math.cos(angle)).toFixed(2)} ${(CENTRE + radius * Math.sin(angle)).toFixed(2)}`
}

const rays = Array.from({ length: RAYS }, (_, index) => {
  const angle = (index / RAYS) * Math.PI * 2
  return `M${polar(44, angle)}L${polar(index % 2 === 0 ? 49 : 47, angle)}`
}).join('')

const seal = Array.from({ length: SEAL_POINTS }, (_, index) =>
  polar(index % 2 === 0 ? 43 : 38.5, (index / SEAL_POINTS) * Math.PI * 2),
)
  .map((point) => point.replace(' ', ','))
  .join(' ')

const icons: Readonly<Record<CountedRow, string[]>> = {
  speak: [
    'M3 10v4h3l7 4V6l-7 4H3z',
    'M16.5 9.5a3.5 3.5 0 0 1 0 5',
    'M19 7a7 7 0 0 1 0 10',
  ],
  help: [
    'M8.5 11h7l-2.2 10h-2.6z',
    'M12 2c2.3 2.2 3.4 3.8 3.4 5.4a3.4 3.4 0 0 1-6.8 0C8.6 5.8 9.7 4.2 12 2z',
  ],
  boat: [
    'M3 15h18l-2.5 4.5h-13z',
    'M12 3v12',
    'M12 4l6 9h-6',
    'M12 6l-4.5 7H12',
  ],
  connect: [
    'M8.3 10.8l7.4-4M8.3 13.2l7.4 4M18 8.1v7.8',
    'M3.4 12a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0 -5.2 0',
    'M15.4 5.5a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0 -5.2 0',
    'M15.4 18.5a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0 -5.2 0',
  ],
}

const iconSize = computed(() =>
  Math.round(props.size * (props.tier === 'crown' ? 0.3 : 0.36)),
)
</script>

<template>
  <span
    class="badge-art"
    :class="`tier-${String(tier)}`"
    :style="{ width: `${String(size)}px`, height: `${String(size)}px` }"
    aria-hidden="true"
  >
    <svg :width="size" :height="size" viewBox="0 0 100 100">
      <circle
        v-if="tier === 'locked'"
        cx="50"
        cy="50"
        r="40"
        class="lock-line"
        stroke-width="2.5"
        stroke-dasharray="6 5"
        fill="none"
      />
      <template v-else-if="tier === 1">
        <circle
          cx="50"
          cy="50"
          r="40"
          class="paper ink-line"
          stroke-width="3"
        />
        <circle
          cx="50"
          cy="50"
          r="33"
          class="ink-line"
          fill="none"
          stroke-width="1"
          stroke-dasharray="2 3"
        />
      </template>
      <template v-else-if="tier === 2">
        <circle cx="50" cy="50" r="43" class="ink ink-line" stroke-width="3" />
        <circle
          cx="50"
          cy="50"
          r="35"
          class="accent-line"
          fill="none"
          stroke-width="3"
        />
        <path
          d="M40 89 l2.2 -4.4 l2.2 4.4 z M57 89 l2.2 -4.4 l2.2 4.4 z"
          class="accent"
        />
      </template>
      <template v-else-if="tier === 3">
        <path
          :d="rays"
          class="accent-line"
          stroke-width="3"
          stroke-linecap="round"
        />
        <circle
          cx="50"
          cy="50"
          r="40"
          class="accent ink-line"
          stroke-width="3.5"
        />
        <circle
          cx="50"
          cy="50"
          r="33"
          class="on-accent-line"
          fill="none"
          stroke-width="1.5"
          stroke-dasharray="3 3"
        />
      </template>
      <template v-else>
        <path
          d="M33 70 L24 98 L32 93 L38 99 L45 76 Z M67 70 L76 98 L68 93 L62 99 L55 76 Z"
          class="accent ink-line"
          stroke-width="2"
          stroke-linejoin="round"
        />
        <polygon
          :points="seal"
          class="ink ink-line"
          stroke-width="2"
          stroke-linejoin="round"
        />
        <circle cx="50" cy="50" r="33" class="accent" />
        <circle
          cx="50"
          cy="50"
          r="28"
          class="on-accent-line"
          fill="none"
          stroke-width="1.5"
        />
        <path
          d="M35 17 L33 4 L42 10 L50 1 L58 10 L67 4 L65 17 Z"
          class="accent ink-line"
          stroke-width="2.5"
          stroke-linejoin="round"
        />
      </template>
    </svg>
    <svg
      class="icon"
      :width="iconSize"
      :height="iconSize"
      viewBox="0 0 24 24"
      fill="none"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path v-for="d in icons[row]" :key="d" :d="d" />
    </svg>
  </span>
</template>

<style scoped>
.badge-art {
  position: relative;
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
}

.badge-art > svg:first-child {
  position: absolute;
  inset: 0;
}

.icon {
  position: relative;
}

.paper {
  fill: var(--paper);
}

.ink {
  fill: var(--ink);
}

.accent {
  fill: var(--accent);
}

.ink-line {
  stroke: var(--ink);
}

.accent-line {
  stroke: var(--accent);
}

.on-accent-line {
  stroke: var(--on-accent);
}

.lock-line {
  stroke: var(--line-strong);
}

.tier-locked .icon {
  stroke: var(--faint);
}

.tier-1 .icon {
  stroke: var(--ink);
}

.tier-2 .icon {
  stroke: var(--paper);
}

.tier-3 .icon,
.tier-crown .icon {
  stroke: var(--on-accent);
}
</style>
