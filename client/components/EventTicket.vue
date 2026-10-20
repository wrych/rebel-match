<script setup lang="ts">
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
    viewBox="0 0 100 100"
    aria-hidden="true"
  >
    <g transform="rotate(-7 50 50)">
      <path
        class="stub"
        d="M12 24 H88 a6 6 0 0 1 6 6 V42 a8 8 0 0 0 0 16 V70 a6 6 0 0 1 -6 6 H12 a6 6 0 0 1 -6 -6 V58 a8 8 0 0 0 0 -16 V30 a6 6 0 0 1 6 -6 Z"
        stroke-width="3"
        stroke-linejoin="round"
      />
      <rect
        class="panel"
        x="12"
        y="34"
        width="30"
        height="32"
        rx="6"
        stroke-width="1.5"
      />
      <image
        v-if="logo"
        :href="logo"
        x="15"
        y="37"
        width="24"
        height="26"
        preserveAspectRatio="xMidYMid meet"
      />
      <path
        v-else
        class="flag"
        d="M21 61 V40 M21 40 H32 L29.5 44.5 L32 49 H21"
        fill="none"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path class="perforation" d="M48 29 V71" stroke-dasharray="3 3" />
      <text class="small-line" x="71" y="47">{{ ticketLine }}</text>
      <text class="big-line" x="71" y="68">{{ bigLine }}</text>
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
