<script setup lang="ts">
/** A member's own challenge as one card linking to its matches: what it is
 * about, its text, and how many matches it has (R-MINE-1). */
defineProps<{
  kicker: string
  body: string
  counts: { sameBoat: number; beenThere: number; cases: number }
  to: string
}>()
</script>

<template>
  <RouterLink :to="to" class="card challenge-row">
    <span class="kicker">{{ kicker }}</span>
    <span class="mine">{{ body }}</span>
    <span class="mono counts">
      {{ counts.sameBoat }} same boat · {{ counts.beenThere }} been there ·
      {{ counts.cases }} case studies
    </span>
  </RouterLink>
</template>
