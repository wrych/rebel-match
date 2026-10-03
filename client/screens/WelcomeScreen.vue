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
  { name: 'admin-invites', label: 'Invite links' },
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
  <section class="screen screen-hero">
    <div class="stack">
      <p class="kicker kicker-accent">You are in</p>
      <h1 class="display display-xl">
        Welcome{{ me?.name ? `, ${me.name}` : '' }}
      </h1>
      <p class="lede">
        Two doors: bring a challenge, or help someone with theirs.
      </p>
    </div>

    <div class="stack">
      <RouterLink to="/ask" class="door door-ask">
        <span class="door-title">Ask for help</span>
        <span class="door-body">
          Bring your challenge and we find the members living it, the ones who
          solved it, and the case studies that apply.
        </span>
      </RouterLink>
      <div class="door door-offer">
        <span class="door-title"
          >Offer help <span class="soon">Soon</span></span
        >
        <span class="door-body">
          Swipe through other members’ challenges and say where you can share
          experience or where you’re in the same boat.
        </span>
      </div>
    </div>

    <RouterLink to="/matches" class="row-link">Your matches</RouterLink>

    <nav v-if="adminLinks.length > 0" class="stack rule" aria-label="Admin">
      <p class="kicker">Host tools</p>
      <RouterLink
        v-for="link in adminLinks"
        :key="link.path"
        :to="link.path"
        class="row-link"
        >{{ link.label }}</RouterLink
      >
    </nav>

    <div class="stack">
      <button type="button" class="btn btn-ghost" @click="leave">
        Sign out
      </button>
      <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
    </div>
  </section>
</template>

<style scoped>
.soon {
  display: inline-block;
  margin-left: 0.4rem;
  padding: 3px 9px;
  border: 1.5px solid currentColor;
  border-radius: 999px;
  font-family: var(--font-mono);
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  vertical-align: middle;
  opacity: 0.85;
}
</style>
