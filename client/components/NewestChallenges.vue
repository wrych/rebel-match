<script setup lang="ts">
import type { NewestChallenge } from '../lib/challenges'

defineProps<{ challenges: NewestChallenge[] }>()
</script>

<template>
  <ul class="stack newest">
    <li
      v-for="(challenge, at) in challenges"
      :key="at"
      class="stack-tight"
      :class="{ rule: at > 0 }"
    >
      <p class="kicker">{{ challenge.trend.short }}</p>
      <p class="mine">{{ challenge.body }}</p>
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
