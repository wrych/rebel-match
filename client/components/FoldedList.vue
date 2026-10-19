<script setup lang="ts">
import { computed, ref } from 'vue'
import FoldChevron from './FoldChevron.vue'

/** A list that shows its first `first` entries and folds the rest behind a
 * control labelled `more(hidden)`; the slot gets how many to show. A null
 * `first` shows everything (R-ASK-15). */
const props = defineProps<{
  count: number
  first: number | null
  more: (hidden: number) => string
}>()

const emit = defineEmits<{ opened: [] }>()

const open = ref(false)
const hidden = computed(() =>
  props.first === null ? 0 : Math.max(props.count - props.first, 0),
)
const shown = computed(() =>
  open.value || hidden.value === 0 ? props.count : (props.first ?? props.count),
)

function toggle(): void {
  open.value = !open.value
  if (open.value) emit('opened')
}
</script>

<template>
  <slot :shown="shown" />
  <button
    v-if="hidden > 0"
    type="button"
    class="btn btn-ghost btn-small fold"
    :aria-expanded="open"
    @click="toggle"
  >
    {{ open ? 'Show fewer' : more(hidden) }}<FoldChevron :open="open" />
  </button>
</template>
