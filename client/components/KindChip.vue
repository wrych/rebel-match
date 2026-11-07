<script setup lang="ts">
import { computed } from 'vue'
import type { ConnectionKind } from '../../src/services/connections'

const props = defineProps<{ kind: ConnectionKind; connected?: boolean }>()

const labels: Record<ConnectionKind, string> = {
  same_boat: 'Same boat',
  been_there: 'Been there',
  direct: 'Direct',
}
const tones: Record<ConnectionKind, string> = {
  same_boat: 'chip-accent',
  been_there: 'chip-ink',
  direct: '',
}

const label = computed(() =>
  props.kind === 'direct' && props.connected === true
    ? 'Connected directly'
    : labels[props.kind],
)
</script>

<template>
  <span class="chip" :class="tones[kind]">{{ label }}</span>
</template>
