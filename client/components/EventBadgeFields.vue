<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ClientConfig } from '../lib/api'
import { logoUrl, type BadgeChoice, type EventBadge } from '../lib/invites'
import EventTicket from './EventTicket.vue'

const props = defineProps<{
  modelValue: BadgeChoice
  /** Badges other invites give, to give the same (R-BADGE-4). */
  badges: readonly EventBadge[]
  limits: ClientConfig['limits'] | null
}>()
const emit = defineEmits<{ 'update:modelValue': [BadgeChoice] }>()

const logoProblem = ref<string | null>(null)
const logoName = ref<string | null>(null)

const BYTES_PER_KB = 1024

const fresh = (): BadgeChoice => ({
  kind: 'new',
  name: '',
  ticketLine: '',
  bigLine: '',
  logoSvg: null,
})

function choose(kind: BadgeChoice['kind']): void {
  logoProblem.value = null
  logoName.value = null
  if (kind === 'none') emit('update:modelValue', { kind })
  else if (kind === 'new') emit('update:modelValue', fresh())
  else emit('update:modelValue', { kind, id: props.badges[0]?.id ?? '' })
}

function edit(field: 'name' | 'ticketLine' | 'bigLine', value: string): void {
  if (props.modelValue.kind !== 'new') return
  emit('update:modelValue', { ...props.modelValue, [field]: value })
}

// Read here to preview it and to say early when it is too big; the server
// cleans it to drawing only and judges it again (R-BADGE-5).
async function upload(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file === undefined || props.modelValue.kind !== 'new') return
  const max = props.limits?.badgeLogoMaxBytes ?? null
  if (max !== null && file.size > max) {
    logoProblem.value = `The logo is too big: at most ${String(Math.floor(max / BYTES_PER_KB))} kB.`
    return
  }
  logoProblem.value = null
  logoName.value = file.name
  emit('update:modelValue', { ...props.modelValue, logoSvg: await file.text() })
}

const preview = computed(() => {
  const badge = props.modelValue
  if (badge.kind === 'new')
    return {
      ticketLine: badge.ticketLine,
      bigLine: badge.bigLine,
      logo:
        badge.logoSvg === null
          ? null
          : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(badge.logoSvg)}`,
    }
  const chosen =
    badge.kind === 'same'
      ? props.badges.find((each) => each.id === badge.id)
      : undefined
  return chosen === undefined
    ? null
    : {
        ticketLine: chosen.ticketLine,
        bigLine: chosen.bigLine,
        logo: chosen.hasLogo ? logoUrl(chosen) : null,
      }
})
</script>

<template>
  <fieldset class="stack badge-fields">
    <legend class="kicker">Event badge</legend>
    <div
      class="choices"
      role="radiogroup"
      aria-label="Badge for who joins here"
    >
      <label class="choice">
        <input
          type="radio"
          name="badge-kind"
          :checked="modelValue.kind === 'none'"
          @change="choose('none')"
        />
        None
      </label>
      <label class="choice">
        <input
          type="radio"
          name="badge-kind"
          :checked="modelValue.kind === 'new'"
          @change="choose('new')"
        />
        A new badge
      </label>
      <label v-if="badges.length > 0" class="choice">
        <input
          type="radio"
          name="badge-kind"
          :checked="modelValue.kind === 'same'"
          @change="choose('same')"
        />
        Same as another invite
      </label>
    </div>

    <template v-if="modelValue.kind === 'new'">
      <div class="field">
        <label for="badge-name">Badge name</label>
        <input
          id="badge-name"
          class="input"
          required
          placeholder="Stormed the Summit"
          :value="modelValue.name"
          :maxlength="limits?.eventBadgeNameMaxChars"
          @input="edit('name', ($event.target as HTMLInputElement).value)"
        />
      </div>
      <div class="pair">
        <div class="field">
          <label for="badge-ticket">Ticket line</label>
          <input
            id="badge-ticket"
            class="input"
            required
            placeholder="SUMMIT"
            :value="modelValue.ticketLine"
            :maxlength="limits?.eventBadgeTicketMaxChars"
            @input="
              edit('ticketLine', ($event.target as HTMLInputElement).value)
            "
          />
        </div>
        <div class="field">
          <label for="badge-big">Big line</label>
          <input
            id="badge-big"
            class="input"
            required
            placeholder="2026"
            :value="modelValue.bigLine"
            :maxlength="limits?.eventBadgeBigMaxChars"
            @input="edit('bigLine', ($event.target as HTMLInputElement).value)"
          />
        </div>
      </div>
      <div class="field">
        <label for="badge-logo">Logo (SVG, optional)</label>
        <input
          id="badge-logo"
          class="input"
          type="file"
          accept=".svg,image/svg+xml"
          @change="upload"
        />
        <p class="small">
          {{
            logoName === null
              ? 'Without one, the ticket shows a flag.'
              : `${logoName} chosen.`
          }}
          It is cleaned on upload: only shapes, text and colours stay.
        </p>
        <p v-if="logoProblem" class="alert" role="alert">{{ logoProblem }}</p>
      </div>
    </template>

    <div v-else-if="modelValue.kind === 'same'" class="field">
      <label for="badge-same">Badge</label>
      <select
        id="badge-same"
        class="input"
        :value="modelValue.id"
        @change="
          emit('update:modelValue', {
            kind: 'same',
            id: ($event.target as HTMLSelectElement).value,
          })
        "
      >
        <option v-for="badge in badges" :key="badge.id" :value="badge.id">
          {{ badge.name }}
        </option>
      </select>
    </div>

    <div v-if="preview" class="preview">
      <EventTicket
        :ticket-line="preview.ticketLine"
        :big-line="preview.bigLine"
        :logo="preview.logo"
        :size="104"
      />
      <span class="small"
        >Members get it, and a notification, when they join here.</span
      >
    </div>
  </fieldset>
</template>

<style scoped>
.badge-fields {
  margin: 0;
  padding: 0;
  border: 0;
}

.choices {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
}

.choice {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 44px;
}

.pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.6rem;
}

.preview {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
</style>
