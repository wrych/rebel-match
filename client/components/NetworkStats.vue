<script setup lang="ts">
import type { Frame } from '../network/replay'
import { day } from '../lib/when'

const props = defineProps<{ frame: Frame }>()

// A replay day is a UTC date; read at noon it is the same date everywhere.
const dayLabel = (shown: string | null): string =>
  shown === null ? '' : day(`${shown}T12:00:00Z`)
</script>

<template>
  <div class="stats mono">
    <p class="when">{{ dayLabel(props.frame.day) }}</p>
    <dl>
      <div>
        <dt>Members</dt>
        <dd>{{ props.frame.nodes }}</dd>
      </div>
      <div>
        <dt>Connections</dt>
        <dd>{{ props.frame.links }}</dd>
      </div>
      <div>
        <dt>Challenges</dt>
        <dd>{{ props.frame.moons }}</dd>
      </div>
    </dl>
  </div>
</template>

<style scoped>
.stats {
  display: grid;
  gap: 0.15rem;
  margin: 0;
  padding: 0.5rem 0.7rem;
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--paper) 82%, transparent);
  font-size: 0.75rem;
  pointer-events: none;
}

.stats dl {
  display: grid;
  gap: 0.15rem;
  margin: 0;
}

.stats dl div {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}

.stats dt {
  color: var(--muted);
}

.stats dd {
  margin: 0;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.when {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 700;
}
</style>
