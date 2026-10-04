<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import SavedTick from '../components/SavedTick.vue'
import { fetchConfig } from '../lib/api'
import { loadMe } from '../lib/session'
import {
  fetchSettings,
  resetSetting,
  saveSetting,
  type Setting,
  type SettingsGroup,
} from '../lib/settings'
import { when } from '../lib/when'

const groups = ref<SettingsGroup[]>([])
const problem = ref<string | null>(null)
const canChange = ref(false)
const tickMs = ref(0)
const ticks = reactive<Record<string, boolean>>({})
const errors = reactive<Record<string, string | null>>({})
const timers: Record<string, ReturnType<typeof setTimeout>> = {}

async function load(): Promise<void> {
  groups.value = await fetchSettings()
}

onMounted(async () => {
  try {
    const [me, config] = await Promise.all([loadMe(), fetchConfig(), load()])
    canChange.value = me?.permissions.includes('settings:manage') ?? false
    tickMs.value = config.limits.savedTickMs
  } catch {
    problem.value = 'The settings could not be loaded.'
  }
})

function tick(key: string): void {
  ticks[key] = true
  clearTimeout(timers[key])
  timers[key] = setTimeout(() => {
    ticks[key] = false
  }, tickMs.value)
}

function refusal(
  setting: Setting,
  reason: 'out_of_bounds' | 'out_of_order',
): string {
  const range = setting.editable
  if (reason === 'out_of_bounds' && range !== undefined)
    return `Use a whole number from ${range.min.toLocaleString('en')} to ${range.max.toLocaleString('en')}.`
  return 'The free number cannot be more than the “at most” number beside it.'
}

// Saved when the field is left or Enter is pressed, like the profile, so a
// half-typed number is never sent (R-CFG-6).
async function change(setting: Setting, event: Event): Promise<void> {
  const key = setting.editable?.key
  if (key === undefined) return
  const value = Number((event.target as HTMLInputElement).value)
  errors[key] = null
  try {
    const result = await saveSetting(key, value)
    if (result !== 'saved') {
      errors[key] = refusal(setting, result)
      return
    }
    await load()
    tick(key)
  } catch {
    errors[key] = 'That did not save. Try again.'
  }
}

async function reset(setting: Setting): Promise<void> {
  const key = setting.editable?.key
  if (key === undefined) return
  errors[key] = null
  try {
    await resetSetting(key)
    await load()
    tick(key)
  } catch {
    errors[key] = 'That did not go back. Try again.'
  }
}
</script>

<template>
  <section class="screen">
    <div class="stack">
      <p class="kicker kicker-accent">Host tools</p>
      <h1 class="display display-lg">Settings</h1>
      <p v-if="canChange" class="lede">
        How this copy of Rebel Match is set up. Values with a field can be
        changed here and apply within a minute. For the rest, set the variable
        on the deployment and deploy again.
      </p>
      <p v-else class="lede">
        How this copy of Rebel Match is set up. To change a value, set its
        variable on the deployment and deploy again.
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
      <dl class="settings">
        <div v-for="setting in group.settings" :key="setting.name" class="row">
          <dt>
            <label
              v-if="canChange && setting.editable"
              :for="`setting-${setting.editable.key}`"
              >{{ setting.name }}</label
            >
            <template v-else>{{ setting.name }}</template>
          </dt>
          <dd v-if="canChange && setting.editable" class="edit">
            <input
              :id="`setting-${setting.editable.key}`"
              class="input number"
              type="number"
              inputmode="numeric"
              :min="setting.editable.min"
              :max="setting.editable.max"
              step="1"
              :value="setting.editable.number"
              :aria-describedby="`about-${setting.editable.key}`"
              @change="change(setting, $event)"
            />
            <span class="unit">{{ setting.editable.unit }}</span>
            <SavedTick :shown="ticks[setting.editable.key] === true" />
          </dd>
          <dd v-else class="value">
            {{ setting.value }}
            <span v-if="setting.changed" class="chip chip-accent">Changed</span>
            <span v-else-if="setting.fixed" class="chip chip-dashed"
              >Fixed in code</span
            >
          </dd>
          <dd
            v-if="setting.editable && errors[setting.editable.key]"
            class="alert"
            role="alert"
          >
            {{ errors[setting.editable.key] }}
          </dd>
          <dd
            :id="setting.editable ? `about-${setting.editable.key}` : undefined"
            class="small"
          >
            {{ setting.explanation }}
          </dd>
          <dd v-if="setting.override" class="small override">
            Changed in the app by {{ setting.override.by ?? 'a former host' }},
            <time :datetime="setting.override.at">{{
              when(setting.override.at)
            }}</time
            >. The deployment would use {{ setting.override.deploymentValue }}.
            <button
              v-if="canChange"
              type="button"
              class="btn btn-ghost reset"
              @click="reset(setting)"
            >
              Use the deployment value
            </button>
          </dd>
          <dd v-if="setting.envVar" class="mono var">{{ setting.envVar }}</dd>
        </div>
      </dl>
    </article>
  </section>
</template>

<style scoped>
.settings {
  margin: 0.4rem 0 0;
}

.row {
  padding: 0.8rem 0;
  border-top: 1px solid var(--line);
}

dt {
  font-weight: 700;
}

dd {
  margin: 0.2rem 0 0;
}

.value,
.edit {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.1rem;
  overflow-wrap: anywhere;
}

.number {
  width: 8rem;
}

.override {
  color: var(--ink);
}

.reset {
  display: block;
  margin-top: 0.5rem;
}

.var {
  color: var(--muted);
  font-size: 0.8rem;
}
</style>
