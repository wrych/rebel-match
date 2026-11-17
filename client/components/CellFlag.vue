<script setup lang="ts">
/** The flag of a member's rebel cell, opening the line under their name on
 * a card and naming the cell on hover and to assistive technology; nothing without a
 * cell (R-PROF-9). */
import { computed } from 'vue'
import { cellLabel, cellOf } from '../../src/profile-options'

const props = defineProps<{ cell: string | null }>()
const found = computed(() => cellOf(props.cell))
const named = computed(() => cellLabel(props.cell))
</script>

<template>
  <span v-if="found" role="img" :aria-label="named" :title="named">{{
    found.flag
  }}</span>
</template>
