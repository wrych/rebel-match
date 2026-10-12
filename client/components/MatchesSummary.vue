<script setup lang="ts">
import { computed, ref } from 'vue'
import { matchesSentence, type MatchesSection } from '../lib/challenges'

/** A matches section as one sentence naming its first `named` entries, with
 * a control that shows the section's cards, the default slot, in place. A
 * null `named` or an empty section shows the slot as it is (R-ASK-15). */
const props = defineProps<{
  section: MatchesSection
  names: string[]
  named: number | null
}>()

const open = ref(false)
const folds = computed(() => props.named !== null && props.names.length > 0)
const sentence = computed(() =>
  matchesSentence(props.section, props.names, props.named ?? 0),
)
</script>

<template>
  <p v-if="folds" class="small summary">
    {{ sentence }}
    <button
      type="button"
      class="read-more"
      :aria-expanded="open"
      @click="open = !open"
    >
      {{ open ? 'Show fewer' : 'Read more…' }}
    </button>
  </p>
  <slot v-if="!folds || open" />
</template>

<style scoped>
.summary {
  margin: 0;
  overflow-wrap: anywhere;
}

.read-more {
  padding: 0;
  border: 0;
  background: none;
  color: var(--accent);
  font: inherit;
  font-weight: 700;
  text-decoration: underline;
  cursor: pointer;
}
</style>
