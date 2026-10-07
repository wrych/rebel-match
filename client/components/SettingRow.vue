<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  changeSetting,
  resetSetting,
  type Refusal,
  type SettingView,
  type SettingsGroup,
} from '../lib/settings'
import { when } from '../lib/when'
import SavedTick from './SavedTick.vue'

const props = defineProps<{
  setting: SettingView
  canManage: boolean
  tickMs: number
}>()
const emit = defineEmits<{ updated: [groups: SettingsGroup[]] }>()

const draft = ref<string | number>(props.setting.edit?.value ?? '')
const tickShown = ref(false)
const problem = ref<string | null>(null)
const busy = ref(false)
let tickTimer: ReturnType<typeof setTimeout> | undefined

watch(
  () => props.setting.edit?.value,
  (value) => {
    if (value !== undefined) draft.value = value
  },
)

function refusal(reason: Refusal): string {
  const edit = props.setting.edit
  if (reason === 'out_of_bounds' && edit !== undefined)
    return `Use a whole number from ${edit.min.toLocaleString('en')} to ${edit.max.toLocaleString('en')}. It was not saved.`
  return 'That would put a limit below the one it must stay above, such as a ceiling below the free uses or a shortest challenge above the longest, so it was not saved.'
}

function tick(): void {
  tickShown.value = true
  clearTimeout(tickTimer)
  tickTimer = setTimeout(() => {
    tickShown.value = false
  }, props.tickMs)
}

async function apply(
  send: () => Promise<SettingsGroup[] | Refusal>,
): Promise<boolean> {
  busy.value = true
  problem.value = null
  try {
    const outcome = await send()
    if (typeof outcome === 'string') {
      problem.value = refusal(outcome)
      return false
    }
    emit('updated', outcome)
    tick()
    return true
  } catch {
    problem.value = 'That did not save. Try again.'
    return false
  } finally {
    busy.value = false
  }
}

async function save(): Promise<void> {
  const edit = props.setting.edit
  if (edit === undefined) return
  const text = String(draft.value).trim()
  const value = Number(text)
  if (text === '' || !Number.isInteger(value)) {
    problem.value = refusal('out_of_bounds')
    return
  }
  if (value === edit.value) {
    problem.value = null
    return
  }
  await apply(() => changeSetting(edit.key, value))
}

async function toggle(event: Event): Promise<void> {
  const edit = props.setting.edit
  if (edit === undefined) return
  const input = event.target as HTMLInputElement
  const saved = await apply(() =>
    changeSetting(edit.key, input.checked ? 1 : 0),
  )
  if (!saved) input.checked = edit.value === 1
}

async function reset(): Promise<void> {
  const edit = props.setting.edit
  if (edit !== undefined) await apply(() => resetSetting(edit.key))
}
</script>

<template>
  <div class="row">
    <template v-if="setting.edit?.kind === 'switch' && canManage">
      <div class="label-row">
        <label class="check name">
          <input
            :id="setting.edit.key"
            type="checkbox"
            role="switch"
            :checked="setting.edit.value === 1"
            :disabled="busy"
            :aria-describedby="`${setting.edit.key}-about`"
            @change="toggle"
          />
          <span>{{ setting.name }}: {{ setting.value }}</span>
        </label>
        <SavedTick :shown="tickShown" />
      </div>
      <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
    </template>
    <template v-else-if="setting.edit && canManage">
      <div class="label-row">
        <label :for="setting.edit.key" class="name">{{ setting.name }}</label>
        <SavedTick :shown="tickShown" />
      </div>
      <div class="entry">
        <input
          :id="setting.edit.key"
          v-model="draft"
          class="input number"
          type="number"
          inputmode="numeric"
          step="1"
          :min="setting.edit.min"
          :max="setting.edit.max"
          :disabled="busy"
          :aria-invalid="problem !== null"
          :aria-describedby="`${setting.edit.key}-about`"
          @change="save"
        />
        <span class="unit">{{ setting.edit.unit }}</span>
        <span v-if="setting.changed" class="chip chip-accent">Changed</span>
      </div>
      <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
    </template>
    <template v-else>
      <p class="name">{{ setting.name }}</p>
      <p class="value">
        {{ setting.value }}
        <span v-if="setting.changed" class="chip chip-accent">Changed</span>
        <span v-else-if="setting.fixed" class="chip chip-dashed"
          >Fixed in code</span
        >
      </p>
    </template>
    <p
      :id="setting.edit ? `${setting.edit.key}-about` : undefined"
      class="small"
    >
      {{ setting.explanation }}
    </p>
    <div v-if="setting.override" class="override">
      <p class="small">
        Changed by {{ setting.override.by ?? 'a former host' }},
        <time :datetime="setting.override.at">{{
          when(setting.override.at)
        }}</time
        >.
      </p>
      <button
        v-if="canManage"
        type="button"
        class="btn btn-ghost btn-small"
        :disabled="busy"
        @click="reset"
      >
        Back to {{ setting.override.deploymentValue }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.row {
  display: grid;
  gap: 0.35rem;
  padding: 0.8rem 0;
  border-top: 1px solid var(--line);
}

.row p {
  margin: 0;
}

.label-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
}

.name {
  font-weight: 700;
}

.entry,
.value {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.1rem;
  overflow-wrap: anywhere;
}

.number {
  width: 9rem;
  min-height: 2.75rem;
  padding: 0.5rem 0.75rem;
}

.unit {
  color: var(--muted);
}

.override {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
}
</style>
