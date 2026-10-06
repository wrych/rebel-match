<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { fetchConfig } from '../lib/api'
import {
  cadenceLabel,
  chooseNotificationCadence,
  fetchNotificationSettings,
  typeLabel,
  type NotificationSetting,
} from '../lib/notifications'
import SavedTick from './SavedTick.vue'

const settings = ref<NotificationSetting[]>([])
const ticks = reactive<Record<string, boolean>>({})
const problem = ref<string | null>(null)
const saving = ref<string | null>(null)
let tickMs = 0
const timers: Record<string, ReturnType<typeof setTimeout>> = {}

onMounted(async () => {
  try {
    const [loaded, config] = await Promise.all([
      fetchNotificationSettings(),
      fetchConfig(),
    ])
    settings.value = loaded
    tickMs = config.limits.savedTickMs
  } catch {
    problem.value = 'These settings could not be loaded. Reload to try again.'
  }
})

// Saved on change, with the profile screen's tick; a failed save goes back to
// what was saved and says so (R-PROF-1, R-NOTE-3).
async function choose(
  setting: NotificationSetting,
  event: Event,
): Promise<void> {
  const select = event.target as HTMLSelectElement
  const before = setting.cadence
  const wanted = select.value as NotificationSetting['cadence']
  saving.value = setting.type
  problem.value = null
  ticks[setting.type] = false
  try {
    await chooseNotificationCadence(setting.type, wanted)
    setting.cadence = wanted
    ticks[setting.type] = true
    clearTimeout(timers[setting.type])
    timers[setting.type] = setTimeout(() => {
      ticks[setting.type] = false
    }, tickMs)
  } catch {
    select.value = before
    problem.value = 'That did not save. Try again.'
  } finally {
    saving.value = null
  }
}
</script>

<template>
  <section class="stack-tight rule" aria-labelledby="notifications-heading">
    <h2 id="notifications-heading" class="kicker">Notifications</h2>
    <p class="small">
      Every notification is kept in the app. Choose how each kind also reaches
      you by email; kinds on the same choice come in one email.
    </p>
    <div v-for="setting in settings" :key="setting.type" class="field">
      <div class="label-row">
        <label :for="`notify-${setting.type}`" class="label">{{
          typeLabel(setting.type)
        }}</label>
        <SavedTick :shown="ticks[setting.type] ?? false" />
      </div>
      <select
        :id="`notify-${setting.type}`"
        class="input"
        :value="setting.cadence"
        :disabled="saving === setting.type"
        @change="choose(setting, $event)"
      >
        <option
          v-for="cadence in setting.offered"
          :key="cadence"
          :value="cadence"
        >
          {{ cadenceLabel(cadence, setting.defaultCadence) }}
        </option>
      </select>
    </div>
    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
  </section>
</template>
