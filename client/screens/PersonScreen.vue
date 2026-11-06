<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PersonCard from '../components/PersonCard.vue'
import { profileConnectPath } from '../lib/codes'
import { contactPath } from '../lib/connections'
import { personConnectPath, reachedFrom, type Reached } from '../lib/people'

const route = useRoute()
const router = useRouter()
const reached = ref<Reached | null>(null)
const problem = ref<string | null>(null)

const connectPath = computed(() => {
  if (reached.value === null) return ''
  const { card, profileCode } = reached.value
  return profileCode === null
    ? personConnectPath(card.memberId)
    : profileConnectPath(profileCode)
})

onMounted(async () => {
  try {
    reached.value = await reachedFrom(route)
    if (reached.value === null)
      await router.replace({
        name: 'not-found',
        params: { pathMatch: route.path.slice(1).split('/') },
      })
  } catch {
    problem.value = 'This could not be loaded. Reload to try again.'
  }
})
</script>

<template>
  <section class="screen">
    <template v-if="reached">
      <div class="stack">
        <p class="kicker kicker-accent">A member</p>
        <h1 class="display display-lg">{{ reached.card.name }}</h1>
      </div>
      <PersonCard :card="reached.card" />
      <template v-if="reached.card.connectionId">
        <p class="lede">You are already connected.</p>
        <RouterLink
          :to="contactPath(reached.card.connectionId)"
          class="btn btn-primary"
          >Open contact</RouterLink
        >
      </template>
      <RouterLink v-else :to="connectPath" class="btn btn-primary"
        >Connect</RouterLink
      >
      <RouterLink
        v-if="reached.profileCode === null"
        to="/people"
        class="btn btn-ghost"
        >Back to Find a member</RouterLink
      >
    </template>
    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
  </section>
</template>
