<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { loadMe, signOut, type Me } from '../lib/session'

const me = ref<Me | null>(null)
const problem = ref<string | null>(null)

onMounted(async () => {
  me.value = await loadMe()
})

async function leave(): Promise<void> {
  try {
    await signOut()
  } catch {
    problem.value = 'You are still signed in: signing out failed. Try again.'
    return
  }
  window.location.assign('/login')
}
</script>

<template>
  <h1>Welcome{{ me?.name ? `, ${me.name}` : '' }}</h1>
  <p>Asking for help and offering it arrive here next.</p>

  <nav v-if="me?.permissions.includes('outbox:read')" aria-label="Admin">
    <RouterLink to="/admin/outbox">Outbound message log</RouterLink>
  </nav>

  <button type="button" @click="leave">Sign out</button>
  <p v-if="problem" role="alert">{{ problem }}</p>
</template>
