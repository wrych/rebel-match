<script setup lang="ts">
defineProps<{ shown: boolean }>()
</script>

<template>
  <span class="saved" role="status">
    <template v-if="shown"><span aria-hidden="true">✓</span> Saved</template>
  </span>
</template>

<style scoped>
.saved {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  letter-spacing: 0.04em;
  color: var(--muted);
  min-height: 1em;
}
</style>
