<script setup lang="ts">
/** The flag of a member's rebel cell, set before their name on a card and
 * naming the cell on hover and to assistive technology; nothing without a
 * cell (R-PROF-9). */
import { computed } from 'vue'
import { cellOf } from '../../src/profile-options'

const props = defineProps<{ cell: string | null }>()
const found = computed(() => cellOf(props.cell))
const named = computed(() =>
  found.value === null ? '' : `Rebel cell: ${found.value.label}`,
)
</script>

<template>
  <span
    v-if="found"
    class="cell-flag"
    role="img"
    :aria-label="named"
    :title="named"
    >{{ found.flag }}</span
  >
</template>

<style scoped>
.cell-flag {
  margin-inline-end: 0.35em;
  font-style: normal;
}
</style>
