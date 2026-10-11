<script setup lang="ts">
import type { LiveList } from '../lib/live-list'

defineProps<{ live: LiveList }>()
</script>

<template>
  <button
    type="button"
    class="btn btn-ghost btn-small refresh"
    :disabled="live.refreshing"
    :aria-busy="live.refreshing"
    @click="live.refresh()"
  >
    {{ live.refreshing ? 'Refreshing…' : 'Refresh' }}
  </button>
</template>

<style scoped>
.refresh {
  align-self: flex-start;
}
</style>
