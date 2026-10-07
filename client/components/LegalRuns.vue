<script setup lang="ts">
import type { Inline } from '../lib/legal'

defineProps<{ runs: Inline[] }>()
</script>

<template>
  <template v-for="(run, index) in runs" :key="index">
    <strong v-if="run.kind === 'strong'">{{ run.text }}</strong>
    <a v-else-if="run.kind === 'link'" :href="run.href">{{ run.text }}</a>
    <template v-else>{{ run.text }}</template>
  </template>
</template>
