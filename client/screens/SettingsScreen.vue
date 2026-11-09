<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import FoldCard from '../components/FoldCard.vue'
import SearchField from '../components/SearchField.vue'
import SettingRow from '../components/SettingRow.vue'
import { fetchConfig } from '../lib/api'
import { useFolds } from '../lib/folds'
import { loadMe } from '../lib/session'
import {
  changedCount,
  fetchSettings,
  searchSettings,
  type SettingsGroup,
} from '../lib/settings'

const groups = ref<SettingsGroup[]>([])
const canManage = ref(false)
const tickMs = ref(0)
const problem = ref<string | null>(null)
const { search, searching, isOpen, remember } = useFolds()

const shown = computed(() => searchSettings(groups.value, search.value))

function counts(group: SettingsGroup): string {
  const total = group.settings.length
  const changed = changedCount(group)
  const values = `${String(total)} ${total === 1 ? 'value' : 'values'}`
  return changed === 0 ? values : `${values}, ${String(changed)} changed`
}

onMounted(async () => {
  try {
    const [settings, me, config] = await Promise.all([
      fetchSettings(),
      loadMe(),
      fetchConfig(),
    ])
    groups.value = settings
    canManage.value = me?.permissions.includes('settings:manage') ?? false
    tickMs.value = config.limits.savedTickMs
  } catch {
    problem.value = 'The settings could not be loaded.'
  }
})
</script>

<template>
  <section class="screen">
    <div class="stack">
      <p class="kicker kicker-accent">Host tools</p>
      <h1 class="display display-lg">Settings</h1>
      <p class="lede">
        How this copy of Rebel Match is set up.
        <template v-if="canManage"
          >Changes to a field save as you make them; the rest change only with a
          new deployment.</template
        >
      </p>
    </div>

    <SearchField
      id="settings-search"
      v-model="search"
      label="Search the settings"
    />

    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
    <p v-else-if="searching && shown.length === 0" class="empty">
      No setting matches.
    </p>

    <FoldCard
      v-for="group in shown"
      :key="group.title"
      :title="group.title"
      :open="isOpen(group.title)"
      @toggled="remember(group.title, $event)"
    >
      <template #note>{{ counts(group) }}</template>
      <p class="small">{{ group.explanation }}</p>
      <div class="settings">
        <SettingRow
          v-for="setting in group.settings"
          :key="setting.name"
          :setting="setting"
          :can-manage="canManage"
          :tick-ms="tickMs"
          @updated="groups = $event"
        />
      </div>
    </FoldCard>
  </section>
</template>

<style scoped>
.settings {
  margin: 0.4rem 0 0;
}
</style>
