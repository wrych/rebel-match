<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PersonCard from '../components/PersonCard.vue'
import {
  fetchMemberCard,
  personConnectPath,
  type MemberCard,
} from '../lib/people'

const route = useRoute()
const router = useRouter()
const memberId = String(route.params['memberId'])
const card = ref<MemberCard | null>(null)
const problem = ref<string | null>(null)

onMounted(async () => {
  try {
    card.value = await fetchMemberCard(memberId)
    if (card.value === null)
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
    <template v-if="card">
      <div class="stack">
        <p class="kicker kicker-accent">A member</p>
        <h1 class="display display-lg">{{ card.name }}</h1>
      </div>
      <PersonCard :card="card" />
      <RouterLink :to="personConnectPath(card.memberId)" class="btn btn-primary"
        >Connect</RouterLink
      >
      <RouterLink to="/people" class="btn btn-ghost"
        >Back to Find a member</RouterLink
      >
    </template>
    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
  </section>
</template>
