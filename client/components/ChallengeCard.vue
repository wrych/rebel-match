<script setup lang="ts">
/** A member's own challenge as one card: what it is about, its text, and how
 * many matches it has; a link when `to` is given (R-MINE-1, R-ASK-12). One
 * withdrawn (R-ASK-17) or hidden by a host (R-MOD-8) says so instead. */
import { hiddenAs, type ModerationReason } from '../lib/moderation'

defineProps<{
  kicker: string
  body: string
  counts: { sameBoat: number; beenThere: number; cases: number } | null
  withdrawn?: boolean
  hiddenReason?: ModerationReason | null
  to?: string | undefined
}>()
</script>

<template>
  <component
    :is="to === undefined ? 'div' : 'RouterLink'"
    :to="to"
    class="card challenge-row"
    :class="{ withdrawn, hidden: !withdrawn && hiddenReason }"
  >
    <span class="card-head">
      <span class="kicker">{{ kicker }}</span>
      <span v-if="withdrawn" class="chip">Withdrawn</span>
      <span v-else-if="hiddenReason" class="chip chip-accent"
        >Hidden by a host</span
      >
    </span>
    <span class="mine">{{ body }}</span>
    <span v-if="withdrawn" class="small">
      Only you see this. Post it again to bring it back.
    </span>
    <span v-else-if="hiddenReason" class="small">
      A host hid it {{ hiddenAs(hiddenReason) }}. Nobody else sees it.
      Questions? Ask a host.
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

.hidden {
  border-color: var(--accent-line);
}
</style>
