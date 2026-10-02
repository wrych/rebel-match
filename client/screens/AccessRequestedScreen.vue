<script setup lang="ts">
import { ref } from 'vue'
import { describeApplicant, keptHandle } from '../lib/admission'

const handle = keptHandle()
const name = ref('')
const org = ref('')
const saving = ref(false)
const outcome = ref<'saved' | 'gone' | 'failed' | null>(null)

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
  <h1>Thanks for your interest in Rebel Match</h1>
  <p>
    Access is approved by a person. We will email you as soon as it is approved,
    and that email will contain your login link.
  </p>
  <p>There is nothing in your inbox yet, so there is no need to check it.</p>

  <template v-if="handle !== null">
    <p v-if="outcome === 'saved'" role="status">
      Thanks — the host can now find you.
    </p>
    <form v-else @submit.prevent="save">
      <p>Optional: your name and organization, so the host can find you.</p>
      <label for="name">Name</label>
      <input id="name" v-model="name" autocomplete="name" />
      <label for="org">Organization</label>
      <input id="org" v-model="org" autocomplete="organization" />
      <button
        type="submit"
        :disabled="saving || (name.trim() === '' && org.trim() === '')"
      >
        Save
      </button>
      <p v-if="outcome === 'gone'" role="alert">
        Your request is no longer waiting, so there is nothing to add to.
      </p>
      <p v-if="outcome === 'failed'" role="alert">
        That did not save. Your request is recorded either way; try again if you
        like.
      </p>
    </form>
  </template>
</template>

<style scoped>
form {
  display: grid;
  gap: 0.5rem;
  max-width: 20rem;
}

input,
button {
  font: inherit;
  padding: 0.6rem;
}
</style>
