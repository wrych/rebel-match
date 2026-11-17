<script setup lang="ts">
/** The small line under a member's name on a card: their rebel cell's flag,
 * then `line`; nothing when both are missing (R-PROF-9). */
import { computed } from 'vue'
import { cellOf } from '../../src/profile-options'
import CellFlag from './CellFlag.vue'

const props = defineProps<{ cell: string | null; line: string }>()
const shown = computed(() => props.line !== '' || cellOf(props.cell) !== null)
</script>

<template>
  <span v-if="shown" class="mono"><CellFlag :cell="cell" />{{ line }}</span>
</template>
