<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import FoldChevron from '../components/FoldChevron.vue'
import SettingRow from '../components/SettingRow.vue'
import { fetchConfig } from '../lib/api'
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
const search = ref('')
const opened = ref(new Set<string>())
const openNow = ref(new Set<string>())

const searching = computed(() => search.value.trim() !== '')
const shown = computed(() => searchSettings(groups.value, search.value))

// A search opens what it finds; only the host's own opening and closing is
// remembered, so clearing the search folds the screen back as they left it.
function toggled(set: Set<string>, title: string, open: boolean): Set<string> {
  const next = new Set(set)
  if (open) next.add(title)
  else next.delete(title)
  return next
}

function remember(title: string, event: Event): void {
  const open = (event.target as HTMLDetailsElement).open
  openNow.value = toggled(openNow.value, title, open)
  if (!searching.value) opened.value = toggled(opened.value, title, open)
}

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

    <div class="field">
      <label for="settings-search">Search the settings</label>
      <input
        id="settings-search"
        v-model="search"
        class="input"
        type="search"
      />
    </div>

    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
    <p v-else-if="searching && shown.length === 0" class="empty">
      No setting matches.
    </p>

    <details
      v-for="group in shown"
      :key="group.title"
      class="card group"
      :open="searching || opened.has(group.title)"
      @toggle="remember(group.title, $event)"
    >
      <summary>
        <h2 class="card-title">{{ group.title }}</h2>
        <span class="small count">{{ counts(group) }}</span>
        <FoldChevron :open="openNow.has(group.title)" class="mark" />
      </summary>
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
    </details>
  </section>
</template>

<style scoped>
.group > summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.15rem 0.75rem;
  list-style: none;
  cursor: pointer;
}

.group > summary::-webkit-details-marker {
  display: none;
}

.group > summary:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 3px;
  border-radius: var(--radius);
}

.mark {
  grid-row: 1 / span 2;
  grid-column: 2;
}

.group > summary > .card-title,
.count {
  margin: 0;
}

.group:not([open]) {
  gap: 0;
  padding-block: 0.75rem;
}

.group[open] > summary {
  margin-bottom: 0.4rem;
}

.settings {
  margin: 0.4rem 0 0;
}
</style>
