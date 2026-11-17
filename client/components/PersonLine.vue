<script setup lang="ts">
/** The small line under a member's name on a card: their rebel cell's flag,
 * then `line`, set apart by a dot as its parts are; nothing when both are
 * missing (R-PROF-9). */
import { computed } from 'vue'
import { cellOf } from '../../src/profile-options'
import CellFlag from './CellFlag.vue'

const props = defineProps<{ cell: string | null; line: string }>()
const hasCell = computed(() => cellOf(props.cell) !== null)
const shown = computed(() => props.line !== '' || hasCell.value)
const separated = computed(() => hasCell.value && props.line !== '')
</script>

<template>
  <span v-if="shown" class="mono"
    ><CellFlag :cell="cell" /><template v-if="separated"> · </template
    >{{ line }}</span
  >
</template>
