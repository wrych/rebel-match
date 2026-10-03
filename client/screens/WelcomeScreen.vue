<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { routeTable } from '../../src/routes'
import { loadMe, signOut, type Me } from '../lib/session'

const me = ref<Me | null>(null)
const problem = ref<string | null>(null)

// Each admin screen's path and permission come from the route table
// (ADR 0017), so this list cannot offer a door the router would refuse.
const adminScreens = [
  { name: 'admin-applicants', label: 'Applicants' },
  { name: 'admin-outbox', label: 'Outbound message log' },
].flatMap(({ name, label }) => {
  const route = routeTable.find((candidate) => candidate.name === name)
  return route === undefined ? [] : [{ ...route, label }]
})
const adminLinks = computed(() =>
  adminScreens.filter(
    (screen) =>
      screen.permission === undefined ||
      me.value?.permissions.includes(screen.permission),
  ),
)

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

  <nav v-if="adminLinks.length > 0" aria-label="Admin">
    <RouterLink v-for="link in adminLinks" :key="link.path" :to="link.path">{{
      link.label
    }}</RouterLink>
  </nav>

  <button type="button" @click="leave">Sign out</button>
  <p v-if="problem" role="alert">{{ problem }}</p>
</template>
