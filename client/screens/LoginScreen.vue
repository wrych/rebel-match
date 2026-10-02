<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { fetchConfig } from '../lib/api'

const email = ref('')
const consentVersion = ref<string | null>(null)
const problem = ref<string | null>(null)

onMounted(async () => {
  try {
    consentVersion.value = (await fetchConfig()).consentVersion
  } catch {
    problem.value = 'The server is not reachable yet.'
  }
})
</script>

<template>
  <h1>Rebel Match</h1>
  <p>Enter your email and we will send you a link to sign in.</p>

  <form @submit.prevent>
    <label for="email">Email</label>
    <input id="email" v-model="email" type="email" autocomplete="email" />
    <button type="submit" disabled>Send me a link</button>
  </form>

  <p v-if="problem" role="status">{{ problem }}</p>
  <p v-else-if="consentVersion" role="status">
    Server reachable — consent version {{ consentVersion }}
  </p>
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
