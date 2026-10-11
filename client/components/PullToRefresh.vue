<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { LiveList } from '../lib/live-list'

const props = defineProps<{ live: LiveList }>()

const pulled = ref(0)
const pulledRefreshing = ref(false)
let from: number | null = null

const ready = computed(
  () => props.live.pullPx !== null && pulled.value >= props.live.pullPx,
)
const height = computed(() =>
  pulledRefreshing.value
    ? (props.live.pullPx ?? 0)
    : Math.min(pulled.value, props.live.pullPx ?? 0),
)

const atTop = (): boolean => window.scrollY <= 0

// One finger, starting with the page at its top: anything else is a scroll,
// a zoom or a swipe of something on the page (R-NAV-12).
function start(event: TouchEvent): void {
  const touch = event.touches[0]
  from =
    event.touches.length === 1 && touch !== undefined && atTop()
      ? touch.clientY
      : null
}

function move(event: TouchEvent): void {
  const touch = event.touches[0]
  if (from === null || touch === undefined) return
  if (event.touches.length > 1 || !atTop()) {
    from = null
    pulled.value = 0
    return
  }
  pulled.value = Math.max(0, touch.clientY - from)
}

async function end(): Promise<void> {
  const release = ready.value && !pulledRefreshing.value
  from = null
  pulled.value = 0
  if (!release) return
  pulledRefreshing.value = true
  try {
    await props.live.refresh()
  } finally {
    pulledRefreshing.value = false
  }
}

function cancel(): void {
  from = null
  pulled.value = 0
}

// Ours replaces the browser's own pull-to-reload while the list is open.
const ROOT_CLASS = 'live-pull'

onMounted(() => {
  document.documentElement.classList.add(ROOT_CLASS)
  document.addEventListener('touchstart', start, { passive: true })
  document.addEventListener('touchmove', move, { passive: true })
  document.addEventListener('touchend', end)
  document.addEventListener('touchcancel', cancel)
})

onUnmounted(() => {
  document.documentElement.classList.remove(ROOT_CLASS)
  document.removeEventListener('touchstart', start)
  document.removeEventListener('touchmove', move)
  document.removeEventListener('touchend', end)
  document.removeEventListener('touchcancel', cancel)
})
</script>

<template>
  <div
    v-if="height > 0"
    class="pull mono small"
    :style="{ height: `${String(height)}px` }"
    aria-hidden="true"
  >
    <span v-if="pulledRefreshing">Refreshing…</span>
    <span v-else-if="ready">Release to refresh</span>
    <span v-else>Pull to refresh</span>
  </div>
</template>

<style scoped>
.pull {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  overflow: hidden;
  color: var(--muted);
}
</style>
