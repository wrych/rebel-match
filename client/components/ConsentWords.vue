<script setup lang="ts">
import { computed } from 'vue'
import { consentWordsOf } from '../../src/consent'
import VersionedWords from './VersionedWords.vue'

const props = defineProps<{ version: string }>()
const words = computed(() => consentWordsOf(props.version))
</script>

<template>
  <VersionedWords :words="words" solid />
</template>
