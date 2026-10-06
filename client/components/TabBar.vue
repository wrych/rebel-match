<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { fetchConfig } from '../lib/api'
import { fetchMatchesNews, NO_NEWS, type MatchesNews } from '../lib/cockpit'
import { poll } from '../lib/poll'
import {
  activeTab,
  matchesBadge,
  matchesLabel,
  showsTabs,
  tabs,
} from '../lib/tabs'

const MS_PER_SECOND = 1000
const route = useRoute()
const news = ref<MatchesNews>(NO_NEWS)
let stopPolling: (() => void) | undefined
let starting: Promise<void> | undefined
let gone = false

const visible = computed(() => showsTabs(route.meta['access'], route.name))
const active = computed(() => activeTab(route.path))
// On the Matches screen itself everything is in view, so its tab carries no
// badge; its sub-screens record no visit, so they keep it (R-MINE-4).
const shown = computed(() => (route.path === '/matches' ? NO_NEWS : news.value))
const badge = computed(() => matchesBadge(shown.value))

async function readNews(): Promise<void> {
  try {
    news.value = await fetchMatchesNews()
  } catch {
    news.value = NO_NEWS
  }
}

// Without the config there is no interval yet; the next move tries again.
async function startPolling(): Promise<void> {
  const config = await fetchConfig().catch(() => null)
  if (config === null) {
    starting = undefined
    return
  }
  if (gone) return
  stopPolling = poll(() => {
    if (visible.value) void readNews()
  }, config.limits.matchesPollSeconds * MS_PER_SECOND)
}

// Re-read on every move, so leaving Matches shows a badge already cleared by
// the visit, and on a timer, so a new request shows without a move
// (R-MINE-4, R-CONN-7). A failed read just shows no badge.
watch(
  () => [route.fullPath, visible.value] as const,
  async ([, show]) => {
    if (!show) return
    starting ??= startPolling()
    await starting
    await readNews()
  },
  { immediate: true },
)

onUnmounted(() => {
  gone = true
  stopPolling?.()
})
</script>

<template>
  <nav v-if="visible" class="tabs" aria-label="Main">
    <RouterLink
      v-for="tab in tabs"
      :key="tab.to"
      :to="tab.to"
      class="tab"
      :class="{ on: active?.to === tab.to }"
      :aria-current="active?.to === tab.to ? 'page' : undefined"
      :aria-label="tab.to === '/matches' ? matchesLabel(shown) : undefined"
    >
      {{ tab.label }}
      <span
        v-if="tab.to === '/matches' && badge > 0"
        class="badge"
        aria-hidden="true"
        >{{ badge }}</span
      >
    </RouterLink>
  </nav>
</template>
