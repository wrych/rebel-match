<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { fetchConfig, type ClientConfig } from '../lib/api'
import {
  createInvite,
  fetchInvites,
  revokeInvite,
  type Invite,
} from '../lib/invites'

const invites = ref<Invite[]>([])
const limits = ref<ClientConfig['limits'] | null>(null)
const draft = reactive({
  label: '',
  validFrom: '',
  validUntil: '',
  maxUses: '',
})
const problem = ref<string | null>(null)
const notice = ref<string | null>(null)
const busy = ref(false)

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
  <h1>Invite links</h1>

  <form @submit.prevent="create">
    <label for="label">Label</label>
    <input
      id="label"
      v-model="draft.label"
      required
      placeholder="Summit 2026 — main stage"
      :maxlength="limits?.inviteLabelMaxChars"
    />
    <label for="valid-from">Valid from (blank: now)</label>
    <input id="valid-from" v-model="draft.validFrom" type="datetime-local" />
    <label for="valid-until"
      >Valid until (blank: {{ limits?.inviteDefaultHours ?? '…' }} hours
      later)</label
    >
    <input id="valid-until" v-model="draft.validUntil" type="datetime-local" />
    <label for="max-uses"
      >Maximum uses (blank: {{ limits?.inviteDefaultMaxUses ?? '…' }})</label
    >
    <input
      id="max-uses"
      v-model="draft.maxUses"
      type="number"
      min="1"
      step="1"
      :max="limits?.inviteMaxUsesCeiling"
    />
    <button type="submit" :disabled="busy || draft.label.trim() === ''">
      Create invite
    </button>
  </form>

  <p v-if="notice" role="status">{{ notice }}</p>
  <p v-if="problem" role="alert">{{ problem }}</p>
  <p v-else-if="invites.length === 0">No invites yet.</p>

  <article v-for="invite in invites" :key="invite.id" class="invite">
    <header>
      <strong>{{ invite.label }}</strong>
      <span :class="`state state-${invite.state}`">{{ invite.state }}</span>
    </header>
    <p>
      {{ invite.uses }} of {{ invite.maxUses }} used ·
      <time :datetime="invite.validFrom">{{ invite.validFrom }}</time> to
      <time :datetime="invite.validUntil">{{ invite.validUntil }}</time> · by
      {{ invite.createdBy }}
    </p>
    <p class="join">
      Join URL: <code>{{ invite.joinUrl }}</code>
    </p>
    <button
      v-if="invite.state !== 'revoked'"
      type="button"
      :disabled="busy"
      @click="revoke(invite)"
    >
      Revoke
    </button>
  </article>
</template>

<style scoped>
form {
  display: grid;
  gap: 0.5rem;
  max-width: 28rem;
  margin-bottom: 1rem;
}

input,
button {
  font: inherit;
  padding: 0.6rem;
}

.invite {
  border-top: 1px solid currentColor;
  padding: 0.5rem 0;
}

.invite header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}

.join code {
  overflow-wrap: anywhere;
}
</style>
