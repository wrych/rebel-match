<script setup lang="ts">
/** The mark on a fold's control: down while it is folded, up while open, so
 * the control reads as one that expands and collapses (R-ASK-15). */
defineProps<{ open: boolean }>()
</script>

<template>
  <svg
    class="chevron"
    :class="{ open }"
    viewBox="0 0 24 24"
    width="14"
    height="14"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M6 9l6 6 6-6" />
  </svg>
</template>

<style scoped>
.chevron {
  flex: none;
  margin-left: 0.3em;
  vertical-align: -0.1em;
  fill: none;
  stroke: currentColor;
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 0.2s ease;
}

.chevron.open {
  transform: rotate(180deg);
}

@media (prefers-reduced-motion: reduce) {
  .chevron {
    transition: none;
  }
}
</style>
