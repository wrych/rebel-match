<script setup lang="ts">
import type { NewestChallenge } from '../lib/challenges'
import { reportPath } from '../lib/reports'

defineProps<{ challenges: NewestChallenge[] }>()
</script>

<template>
  <ul class="stack newest">
    <li
      v-for="(challenge, at) in challenges"
      :key="challenge.id"
      class="stack-tight"
      :class="{ rule: at > 0 }"
    >
      <p class="kicker">{{ challenge.trend.short }}</p>
      <p class="mine">{{ challenge.body }}</p>
      <RouterLink
        :to="reportPath({ challengeId: challenge.id })"
        class="small report-link"
        >Report</RouterLink
      >
    </li>
  </ul>
</template>

<style scoped>
.newest {
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
