<script lang="ts">
import { computed, onUnmounted, ref } from 'vue'

// One tick on screen at a time: the last button pressed, until it fades.
const lastCopied = ref<symbol | null>(null)
let tickTimer: ReturnType<typeof setTimeout> | undefined
</script>

<script setup lang="ts">
const props = defineProps<{
  /** What goes on the clipboard. */
  text: string
  /** The button's accessible name, e.g. "Copy the join URL of Main stage". */
  label: string
  /** How long the tick shows; null keeps it until the next press. */
  tickMs: number | null
}>()
const emit = defineEmits<{ copied: []; failed: [] }>()

const self = Symbol('copy')
const copied = computed(() => lastCopied.value === self)

async function copy(): Promise<void> {
  clearTimeout(tickTimer)
  lastCopied.value = null
  try {
    await navigator.clipboard.writeText(props.text)
    lastCopied.value = self
    if (props.tickMs !== null)
      tickTimer = setTimeout(() => (lastCopied.value = null), props.tickMs)
    emit('copied')
  } catch {
    emit('failed')
  }
}

onUnmounted(() => {
  if (copied.value) {
    clearTimeout(tickTimer)
    lastCopied.value = null
  }
})
</script>

<template>
  <button
    type="button"
    class="btn btn-ghost copy"
    :aria-label="label"
    :title="copied ? 'Copied' : 'Copy'"
    @click="copy"
  >
    <svg
      class="icon"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      <path v-if="copied" d="M5 12.5 10 17.5 19 7" />
      <template v-else>
        <rect x="9" y="9" width="11" height="11" rx="2" />
        <path d="M5 15V6a2 2 0 0 1 2-2h8" />
      </template>
    </svg>
  </button>
</template>

<style scoped>
.copy {
  flex: none;
  width: 2.75rem;
  min-height: 2.75rem;
  padding: 0;
}

.icon {
  fill: none;
  stroke: currentcolor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
