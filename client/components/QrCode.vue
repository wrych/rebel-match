<script setup lang="ts">
/** A QR code of `value`, dark modules on the paper colour in every look,
 * with the four-module quiet zone the standard asks for (ADR 0063). */
import { computed } from 'vue'
import { encode } from 'uqr'

const props = defineProps<{ value: string; label: string }>()

const QUIET_ZONE = 4

const code = computed(() => encode(props.value, { border: QUIET_ZONE }))
const modules = computed(() =>
  code.value.data
    .flatMap((row, y) =>
      row.flatMap((dark, x) =>
        dark ? [`M${String(x)} ${String(y)}h1v1h-1z`] : [],
      ),
    )
    .join(''),
)
</script>

<template>
  <svg
    class="qr"
    role="img"
    :aria-label="label"
    :viewBox="`0 0 ${String(code.size)} ${String(code.size)}`"
    shape-rendering="crispEdges"
  >
    <rect class="qr-paper" :width="code.size" :height="code.size" />
    <path class="qr-modules" :d="modules" />
  </svg>
</template>

<style scoped>
.qr {
  display: block;
  width: 100%;
  max-width: 18rem;
  height: auto;
  margin: 0 auto;
}

.qr-paper {
  fill: var(--paper);
}

.qr-modules {
  fill: var(--ink);
}
</style>
