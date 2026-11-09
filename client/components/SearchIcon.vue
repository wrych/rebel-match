<script setup lang="ts">
/** A magnifying glass beside a way to search (R-FIND-1). */
</script>

<template>
  <svg
    class="search-icon"
    viewBox="0 0 24 24"
    width="16"
    height="16"
    aria-hidden="true"
    focusable="false"
  >
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.5 15.5 21 21" />
  </svg>
</template>

<style scoped>
.search-icon {
  flex: none;
  fill: none;
  stroke: currentcolor;
  stroke-width: 2.5;
  stroke-linecap: round;
}
</style>
