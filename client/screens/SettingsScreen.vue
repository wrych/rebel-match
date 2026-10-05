<script setup lang="ts">
import { onMounted, ref } from 'vue'
import SettingRow from '../components/SettingRow.vue'
import { fetchConfig } from '../lib/api'
import { loadMe } from '../lib/session'
import { fetchSettings, type SettingsGroup } from '../lib/settings'

const groups = ref<SettingsGroup[]>([])
const canManage = ref(false)
const tickMs = ref(0)
const problem = ref<string | null>(null)

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

    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>

    <article
      v-for="(group, index) in groups"
      :key="group.title"
      class="card"
      :aria-labelledby="`group-${index}`"
    >
      <h2 :id="`group-${index}`" class="card-title">{{ group.title }}</h2>
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
    </article>
  </section>
</template>

<style scoped>
.settings {
  margin: 0.4rem 0 0;
}
</style>
