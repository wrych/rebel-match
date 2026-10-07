<script setup lang="ts">
import type { Paragraph } from '../../src/consent'

defineProps<{ words: readonly Paragraph[]; solid?: boolean }>()
</script>

<template>
  <div :class="['words', solid ? 'card-solid' : 'card']">
    <template v-for="(paragraph, index) in words" :key="index">
      <p v-if="typeof paragraph === 'string'">{{ paragraph }}</p>
      <div v-else class="stack-tight">
        <h3 class="kicker">{{ paragraph.heading }}</h3>
        <p>{{ paragraph.text }}</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.words p {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.45;
}
</style>
