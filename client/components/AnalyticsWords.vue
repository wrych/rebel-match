<script setup lang="ts">
import { computed } from 'vue'
import { analyticsWordsOf } from '../../src/analytics-consent'

const props = defineProps<{ version: string }>()
const words = computed(() => analyticsWordsOf(props.version))
</script>

<template>
  <div class="stack-tight words">
    <p v-for="(paragraph, index) in words" :key="index" class="small">
      {{ paragraph }}
    </p>
  </div>
</template>

<style scoped>
.words p {
  margin: 0;
}
</style>
