<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { describeApplicant, keptHandle } from '../lib/admission'
import { fetchConfig, type ClientConfig } from '../lib/api'

const handle = keptHandle()
// In the URL so a reload keeps it, and never the token itself (R-INV-5).
const inviteRefused =
  new URLSearchParams(window.location.search).get('invite') === 'invalid'
const name = ref('')
const org = ref('')
const saving = ref(false)
const outcome = ref<'saved' | 'gone' | 'failed' | null>(null)
const limits = ref<ClientConfig['limits'] | null>(null)

onMounted(async () => {
  try {
    limits.value = (await fetchConfig()).limits
  } catch {
    // Without the limits the server still refuses an overlong field.
  }
})

async function save(): Promise<void> {
  if (handle === null) return
  saving.value = true
  try {
    outcome.value = await describeApplicant(handle, {
      name: name.value,
      org: org.value,
    })
  } catch {
    outcome.value = 'failed'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="screen">
    <p v-if="inviteRefused" role="status" class="notice invite-notice">
      This invitation link isn’t valid right now.
    </p>

    <div class="stack">
      <p class="kicker kicker-accent">Request recorded</p>
      <h1 class="display display-lg">
        Thanks for your interest in Rebel Match
      </h1>
    </div>

    <div class="card-solid">
      <p class="kicker">What happens next</p>
      <p>
        Access is approved by a person. We will email you as soon as it is
        approved, and that email will contain your login link.
      </p>
      <p>
        There is nothing in your inbox yet, so there is no need to check it.
      </p>
    </div>

    <template v-if="handle !== null">
      <p v-if="outcome === 'saved'" class="notice notice-solid" role="status">
        Thanks — the host can now find you.
      </p>
      <form v-else class="stack rule" @submit.prevent="save">
        <p class="small">
          Optional: your name and organization, so the host can find you in the
          room.
        </p>
        <div class="field">
          <label for="name">Name</label>
          <input
            id="name"
            v-model="name"
            class="input"
            autocomplete="name"
            :maxlength="limits?.nameMaxChars"
          />
        </div>
        <div class="field">
          <label for="org">Organization</label>
          <input
            id="org"
            v-model="org"
            class="input"
            autocomplete="organization"
            :maxlength="limits?.orgMaxChars"
          />
        </div>
        <button
          type="submit"
          class="btn btn-dark"
          :disabled="saving || (name.trim() === '' && org.trim() === '')"
        >
          Save
        </button>
        <p v-if="outcome === 'gone'" class="alert" role="alert">
          Your request is no longer waiting, so there is nothing to add to.
        </p>
        <p v-if="outcome === 'failed'" class="alert" role="alert">
          That did not save. Your request is recorded either way; try again if
          you like.
        </p>
      </form>
    </template>
  </section>
</template>
