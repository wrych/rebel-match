<script setup lang="ts">
/** A card folded to its title, opened and closed by tapping it, as the host
 * settings and the profile screen group what they hold (R-CFG-5, R-PROF-8). */
import { ref } from 'vue'
import FoldChevron from './FoldChevron.vue'

const props = defineProps<{ title: string; open: boolean }>()
const emit = defineEmits<{ toggled: [open: boolean] }>()

const shown = ref(props.open)

function toggled(event: Event): void {
  shown.value = (event.target as HTMLDetailsElement).open
  emit('toggled', shown.value)
}
</script>

<template>
  <details class="card fold" :open="open" @toggle="toggled">
    <summary>
      <h2 class="card-title">{{ title }}</h2>
      <span v-if="$slots['note']" class="small note"><slot name="note" /></span>
      <FoldChevron :open="shown" class="mark" />
    </summary>
    <slot />
  </details>
</template>

<style scoped>
.fold > summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.15rem 0.75rem;
  list-style: none;
  cursor: pointer;
}

.fold > summary::-webkit-details-marker {
  display: none;
}

.fold > summary:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 3px;
  border-radius: var(--radius);
}

.mark {
  grid-row: 1 / span 2;
  grid-column: 2;
}

.fold > summary > .card-title,
.note {
  margin: 0;
}

.fold:not([open]) {
  gap: 0;
  padding-block: 0.75rem;
}

.fold[open] > summary {
  margin-bottom: 0.4rem;
}

.fold > summary + :deep(.rule) {
  border-top: none;
  padding-top: 0;
}
</style>
