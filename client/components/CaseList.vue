<script setup lang="ts">
import type { Matches } from '../lib/challenges'

defineProps<{ cases: Matches['cases'] }>()
</script>

<template>
  <p v-if="cases.length === 0" class="empty">
    No case studies for this trend yet.
  </p>
  <a
    v-for="study in cases"
    :key="study.url"
    :href="study.url"
    target="_blank"
    rel="noopener noreferrer"
    class="case"
  >
    <span class="case-org">{{ study.org }}</span>
    <span class="case-takeaway">{{ study.takeaway }}</span>
  </a>
</template>
