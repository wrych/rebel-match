<script setup lang="ts">
/** A member's own challenge as one card: what it is about, its text, and how
 * many matches it has; a link when `to` is given (R-MINE-1, R-ASK-12). A
 * withdrawn one says so instead of counting (R-ASK-17). */
defineProps<{
  kicker: string
  body: string
  counts: { sameBoat: number; beenThere: number; cases: number } | null
  withdrawn?: boolean
  to?: string | undefined
}>()
</script>

<template>
  <component
    :is="to === undefined ? 'div' : 'RouterLink'"
    :to="to"
    class="card challenge-row"
    :class="{ withdrawn }"
  >
    <span class="card-head">
      <span class="kicker">{{ kicker }}</span>
      <span v-if="withdrawn" class="chip">Withdrawn</span>
    </span>
    <span class="mine">{{ body }}</span>
    <span v-if="withdrawn" class="small">
      Only you see this. Post it again to bring it back.
    </span>
    <span v-else-if="counts" class="mono counts">
      {{ counts.sameBoat }} same boat · {{ counts.beenThere }} been there ·
      {{ counts.cases }} case studies
    </span>
  </component>
</template>

<style scoped>
.withdrawn {
  border-style: dashed;
  background: transparent;
}
</style>
