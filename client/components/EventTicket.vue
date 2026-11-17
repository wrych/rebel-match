<script setup lang="ts">
import { TICKET } from '../lib/ticket'

withDefaults(
  defineProps<{
    ticketLine: string
    bigLine: string
    /** The logo's address, shown only as an image; a flag without one
     * (R-BADGE-5). */
    logo: string | null
    size?: number
  }>(),
  { size: 96 },
)
</script>

<template>
  <svg
    class="ticket"
    :width="size"
    :height="size"
    :viewBox="`0 0 ${TICKET.grid} ${TICKET.grid}`"
    aria-hidden="true"
  >
    <g
      :transform="`rotate(${TICKET.tilt} ${TICKET.grid / 2} ${TICKET.grid / 2})`"
    >
      <path
        class="stub"
        :d="TICKET.stub"
        :stroke-width="TICKET.strokes.stub"
        stroke-linejoin="round"
      />
      <path
        class="panel"
        :d="TICKET.panel"
        :stroke-width="TICKET.strokes.panel"
      />
      <image
        v-if="logo"
        :href="logo"
        v-bind="TICKET.logo"
        preserveAspectRatio="xMidYMid meet"
      />
      <path
        v-else
        class="flag"
        :d="TICKET.flag"
        fill="none"
        :stroke-width="TICKET.strokes.flag"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        class="perforation"
        :d="TICKET.perforation"
        :stroke-dasharray="`${TICKET.dash} ${TICKET.dash}`"
      />
      <text class="small-line" :x="TICKET.smallLine.x" :y="TICKET.smallLine.y">
        {{ ticketLine }}
      </text>
      <text class="big-line" :x="TICKET.bigLine.x" :y="TICKET.bigLine.y">
        {{ bigLine }}
      </text>
    </g>
  </svg>
</template>

<style scoped>
.ticket {
  flex: none;
}

.stub {
  fill: var(--accent);
  stroke: var(--ink);
}

.panel {
  fill: var(--paper);
  stroke: var(--ink);
}

.flag {
  stroke: var(--ink);
}

.perforation {
  stroke: var(--on-accent);
  stroke-width: 1.5;
}

text {
  fill: var(--on-accent);
  text-anchor: middle;
}

.small-line {
  font-family: var(--font-mono);
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: 0.8px;
}

.big-line {
  font-family: var(--font-display);
  font-size: 20px;
}
</style>
