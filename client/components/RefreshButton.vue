<script setup lang="ts">
import type { LiveList } from '../lib/live-list'

defineProps<{ live: LiveList }>()
</script>

<template>
  <button
    type="button"
    class="btn btn-ghost refresh"
    :class="{ spinning: live.refreshing }"
    :disabled="live.refreshing"
    :aria-busy="live.refreshing"
    :aria-label="live.refreshing ? 'Refreshing' : 'Refresh'"
    :title="live.refreshing ? 'Refreshing…' : 'Refresh'"
    @click="live.refresh()"
  >
    <svg
      class="icon"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <path d="M20 4v5h-5" />
    </svg>
  </button>
</template>

<style scoped>
.refresh {
  flex: none;
  width: 3.4rem;
  padding: 0;
}

.icon {
  fill: none;
  stroke: currentcolor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.spinning .icon {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
