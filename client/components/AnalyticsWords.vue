<script setup lang="ts">
import { computed } from 'vue'
import { analyticsWordsOf } from '../../src/analytics-consent'
import VersionedWords from './VersionedWords.vue'

const props = defineProps<{ version: string }>()
const words = computed(() => analyticsWordsOf(props.version))
</script>

<template>
  <VersionedWords :words="words" />
</template>
