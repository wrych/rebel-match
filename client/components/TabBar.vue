<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { fetchCockpit } from '../lib/cockpit'
import { activeTab, matchesLabel, showsTabs, tabs } from '../lib/tabs'

const route = useRoute()
const waiting = ref(0)

const visible = computed(() => showsTabs(route.meta['access'], route.name))
const active = computed(() => activeTab(route.path))

// Re-read on every move, so an answered request leaves the badge as soon as
// the member navigates on (R-MINE-4). A failed read just shows no badge.
watch(
  () => [route.fullPath, visible.value] as const,
  async ([, show]) => {
    if (!show) return
    try {
      waiting.value = (await fetchCockpit()).pendingIncoming
    } catch {
      waiting.value = 0
    }
  },
  { immediate: true },
)
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
      :aria-label="tab.to === '/matches' ? matchesLabel(waiting) : undefined"
    >
      {{ tab.label }}
      <span
        v-if="tab.to === '/matches' && waiting > 0"
        class="badge"
        aria-hidden="true"
        >{{ waiting }}</span
      >
    </RouterLink>
  </nav>
</template>
