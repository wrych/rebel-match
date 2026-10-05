<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { fetchConfig, type ClientConfig } from '../lib/api'
import {
  createInvite,
  fetchInvites,
  raiseCap,
  revokeInvite,
  type Invite,
} from '../lib/invites'
import { when } from '../lib/when'

const invites = ref<Invite[]>([])
const limits = ref<ClientConfig['limits'] | null>(null)
const draft = reactive({
  label: '',
  validFrom: '',
  validUntil: '',
  maxUses: '',
})
const raising = ref<string | null>(null)
const newCap = ref('')
const problem = ref<string | null>(null)
const notice = ref<string | null>(null)
const busy = ref(false)

const chipFor: Record<Invite['state'], string> = {
  active: 'chip-accent',
  scheduled: 'chip-dashed',
  expired: '',
  exhausted: '',
  revoked: 'chip-ink',
}

async function load(): Promise<void> {
  try {
    invites.value = await fetchInvites()
    problem.value = null
  } catch {
    problem.value = 'The invites could not be loaded.'
  }
}

async function create(): Promise<void> {
  busy.value = true
  try {
    const outcome = await createInvite(draft)
    if (outcome === 'bad-window') {
      notice.value = 'The window must end after it starts.'
      return
    }
    notice.value = `Created “${outcome.label}”. Its join URL is below.`
    Object.assign(draft, {
      label: '',
      validFrom: '',
      validUntil: '',
      maxUses: '',
    })
    await load()
  } catch {
    notice.value = 'The invite was not created. Try again.'
  } finally {
    busy.value = false
  }
}

function startRaising(invite: Invite): void {
  raising.value = invite.id
  newCap.value = ''
}

async function raise(invite: Invite): Promise<void> {
  busy.value = true
  try {
    const outcome = await raiseCap(invite.id, Number(newCap.value))
    if (outcome === 'bad-cap') {
      notice.value = `The new cap must be more than ${String(invite.maxUses)}${
        limits.value === null
          ? ''
          : ` and at most ${String(limits.value.inviteMaxUsesCeiling)}`
      }.`
      return
    }
    notice.value =
      outcome === 'revoked'
        ? `“${invite.label}” is revoked, so its cap stays.`
        : `“${invite.label}” now admits up to ${String(outcome.maxUses)}. The same code keeps working.`
    raising.value = null
    await load()
  } catch {
    notice.value = `The cap of “${invite.label}” was not raised. Try again.`
  } finally {
    busy.value = false
  }
}

async function revoke(invite: Invite): Promise<void> {
  busy.value = true
  try {
    await revokeInvite(invite.id)
    notice.value = `Revoked “${invite.label}”: the next scan joins the queue instead.`
    await load()
  } catch {
    notice.value = `“${invite.label}” was not revoked. Try again.`
  } finally {
    busy.value = false
  }
}

onMounted(async () => {
  await load()
  try {
    limits.value = (await fetchConfig()).limits
  } catch {
    // Without the limits the server still applies its defaults.
  }
})
</script>

<template>
  <section class="screen">
    <div class="stack">
      <p class="kicker kicker-accent">Host tools</p>
      <h1 class="display display-lg">Invite links</h1>
      <p class="lede">
        A link in a QR code admits whoever scans it, inside its window and up to
        its cap. Revoke it the moment it escapes.
      </p>
    </div>

    <form class="stack card" @submit.prevent="create">
      <p class="kicker">New invite</p>
      <div class="field">
        <label for="label">Label</label>
        <input
          id="label"
          v-model="draft.label"
          class="input"
          required
          placeholder="Summit 2026 — main stage"
          :maxlength="limits?.inviteLabelMaxChars"
        />
      </div>
      <div class="pair">
        <div class="field">
          <label for="valid-from">From (blank: now)</label>
          <input
            id="valid-from"
            v-model="draft.validFrom"
            class="input"
            type="datetime-local"
          />
        </div>
        <div class="field">
          <label for="valid-until"
            >Until (blank: +{{ limits?.inviteDefaultHours ?? '…' }}h)</label
          >
          <input
            id="valid-until"
            v-model="draft.validUntil"
            class="input"
            type="datetime-local"
          />
        </div>
      </div>
      <div class="field">
        <label for="max-uses"
          >Maximum uses (blank:
          {{ limits?.inviteDefaultMaxUses ?? '…' }})</label
        >
        <input
          id="max-uses"
          v-model="draft.maxUses"
          class="input"
          type="number"
          min="1"
          step="1"
          :max="limits?.inviteMaxUsesCeiling"
        />
      </div>
      <button
        type="submit"
        class="btn btn-primary"
        :disabled="busy || draft.label.trim() === ''"
      >
        Create invite
      </button>
    </form>

    <p v-if="notice" class="notice notice-solid" role="status">{{ notice }}</p>
    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
    <p v-else-if="invites.length === 0" class="empty">No invites yet.</p>

    <article v-for="invite in invites" :key="invite.id" class="card">
      <div class="card-head">
        <span class="card-title">{{ invite.label }}</span>
        <span :class="['chip', chipFor[invite.state]]">{{ invite.state }}</span>
      </div>
      <div class="meter" aria-hidden="true">
        <span
          :style="{
            width: `${Math.min(100, (invite.uses / invite.maxUses) * 100)}%`,
          }"
        ></span>
      </div>
      <p class="mono meta">
        {{ invite.uses }} of {{ invite.maxUses }} used ·
        <time :datetime="invite.validFrom">{{ when(invite.validFrom) }}</time>
        to
        <time :datetime="invite.validUntil">{{ when(invite.validUntil) }}</time>
        · by {{ invite.createdBy }}
      </p>
      <p class="join">
        <span class="label">Join URL</span> {{ invite.joinUrl }}
      </p>
      <form
        v-if="raising === invite.id"
        class="raise"
        @submit.prevent="raise(invite)"
      >
        <label :for="`cap-${invite.id}`">New cap</label>
        <input
          :id="`cap-${invite.id}`"
          v-model="newCap"
          class="input"
          type="number"
          inputmode="numeric"
          :min="invite.maxUses + 1"
          :max="limits?.inviteMaxUsesCeiling"
          :placeholder="`more than ${String(invite.maxUses)}`"
          required
        />
        <button type="submit" class="btn btn-small" :disabled="busy">
          Raise
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-small"
          @click="raising = null"
        >
          Cancel
        </button>
      </form>
      <div v-else-if="invite.state !== 'revoked'" class="actions">
        <button
          type="button"
          class="btn btn-ghost btn-small"
          :disabled="busy"
          @click="startRaising(invite)"
        >
          Raise cap…
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-small"
          :disabled="busy"
          @click="revoke(invite)"
        >
          Revoke
        </button>
      </div>
    </article>
  </section>
</template>

<style scoped>
.raise {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.raise .input {
  width: 11rem;
}

.pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.6rem;
}

.meta {
  margin: 0;
  color: var(--muted);
  overflow-wrap: anywhere;
}

.meter {
  height: 6px;
  border-radius: 3px;
  background: var(--line);
  overflow: hidden;
}

.meter span {
  display: block;
  height: 100%;
  background: var(--accent);
}

.join {
  display: grid;
  gap: 0.3rem;
  margin: 0;
  padding: 0.7rem 0.8rem;
  border-radius: 10px;
  background: var(--paper);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  overflow-wrap: anywhere;
}
</style>
