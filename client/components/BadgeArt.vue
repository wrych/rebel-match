<script setup lang="ts">
import { computed } from 'vue'
import { rowNames, type BadgeRow } from '../../src/badges/rows'
import type { Tier } from '../lib/badges'

const props = withDefaults(
  defineProps<{ row: BadgeRow; tier: Tier; size?: number }>(),
  { size: 72 },
)

const STAR_POINTS = 10
const PROMOTED_WITH_STAR = 5
const REBEL = 6

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

// The game's promotions are ID cards on a lanyard, finer with each job; the
// Rebel's hangs askew (R-BADGE-9).
const card = computed(() =>
  props.row === 'game' && props.tier !== 'crown'
    ? {
        level: props.tier === 'locked' ? 0 : props.tier,
        label: (
          rowNames.game.levels[Number(props.tier) - 1] ?? ''
        ).toUpperCase(),
        tilt: props.tier === REBEL ? 'rotate(-8 50 50)' : undefined,
      }
    : null,
)

const star = Array.from({ length: STAR_POINTS }, (_, index) => {
  const angle = (index / STAR_POINTS) * Math.PI * 2 - Math.PI / 2
  const radius = index % 2 === 0 ? 6 : 2.6
  return `${index === 0 ? 'M' : 'L'}${(50 + radius * Math.cos(angle)).toFixed(2)} ${(79 + radius * Math.sin(angle)).toFixed(2)}`
}).join(' ')

const icons: Readonly<Record<BadgeRow, string[]>> = {
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
  game: ['M8 3h8l-1.5 3h-5z', 'M9.5 6L7 17l5 4 5-4-2.5-11'],
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
    <svg
      v-if="card"
      :class="`job job-${String(card.level)}`"
      :width="size"
      :height="size"
      viewBox="0 0 100 100"
    >
      <g :transform="card.tilt">
        <path
          d="M38 4 L50 22 L62 4"
          class="strap"
          fill="none"
          stroke-width="5"
          stroke-linejoin="round"
        />
        <rect
          x="27"
          y="20"
          width="46"
          height="70"
          rx="7"
          class="card"
          stroke-width="3"
          :stroke-dasharray="card.level === 0 ? '5 4' : undefined"
        />
        <rect x="43" y="25" width="14" height="4" rx="2" class="slot" />
        <text v-if="card.level === 0" x="50" y="66" class="question">?</text>
        <template v-else>
          <circle cx="50" cy="47" r="10" class="face" />
          <rect x="27" y="60" width="46" height="12" class="band" />
          <text
            x="50"
            y="69"
            class="label"
            :font-size="card.label.length > 5 ? 6 : 8"
          >
            {{ card.label }}
          </text>
          <path
            v-if="card.level >= PROMOTED_WITH_STAR"
            :d="star"
            class="star"
          />
        </template>
      </g>
    </svg>
    <svg v-else :width="size" :height="size" viewBox="0 0 100 100">
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
      v-if="!card"
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

.job text {
  font-family: var(--font-mono);
  font-weight: 700;
  letter-spacing: 0;
  text-anchor: middle;
}

.job .strap {
  fill: none;
  stroke: var(--ink);
}

.job .slot {
  fill: var(--line-strong);
}

.job .label {
  fill: var(--paper);
}

.job-0 .strap,
.job-0 .card {
  stroke: var(--line-strong);
}

.job-0 .card {
  fill: none;
}

.job-0 .question {
  font-size: 20px;
  fill: var(--faint);
}

.job-1 .strap {
  stroke: var(--faint);
}

.job-1 .card,
.job-2 .card {
  fill: var(--field);
  stroke: var(--ink);
}

.job-1 .band {
  fill: var(--line);
}

.job-1 .label {
  fill: var(--ink);
}

.job-1 .face {
  fill: var(--line-strong);
}

.job-2 .band,
.job-2 .face {
  fill: var(--ink);
}

.job-3 .card,
.job-4 .card {
  fill: var(--ink);
  stroke: var(--ink);
}

.job-3 .band,
.job-3 .face,
.job-4 .face {
  fill: var(--ink-soft);
}

.job-4 .strap,
.job-5 .strap {
  stroke: var(--accent);
}

.job-4 .band,
.job-5 .band,
.job-5 .face {
  fill: var(--accent);
}

.job-5 .card {
  fill: var(--ink);
  stroke: var(--accent);
}

.job-5 .star {
  fill: var(--paper);
}

.job-6 .card {
  fill: var(--accent);
  stroke: var(--ink);
}

.job-6 .band,
.job-6 .face,
.job-6 .star {
  fill: var(--ink);
}
</style>
