<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import AskSteps from '../components/AskSteps.vue'
import CaseList from '../components/CaseList.vue'
import FollowButton from '../components/FollowButton.vue'
import PeerCards from '../components/PeerCards.vue'
import {
  fetchChallenge,
  fetchMatches,
  type Challenge,
  type Matches,
} from '../lib/challenges'

const route = useRoute()
const id = String(route.params.id)
const challenge = ref<Challenge | null>(null)
const matches = ref<Matches | null>(null)
const missing = ref(false)
const problem = ref<string | null>(null)

onMounted(async () => {
  try {
    const [found, matched] = await Promise.all([
      fetchChallenge(id),
      fetchMatches(id),
    ])
    missing.value = found === null || matched === null
    challenge.value = found
    matches.value = matched
  } catch {
    problem.value = 'Your matches could not be loaded. Reload to try again.'
  }
})
</script>

<template>
  <AskSteps :current="3" />
  <section class="screen">
    <p v-if="missing" class="empty">There is no challenge of yours here.</p>

    <template v-else-if="challenge && matches">
      <div class="stack-tight">
        <p class="mine">{{ challenge.body }}</p>
        <p class="kicker">{{ matches.trend.short }}</p>
      </div>

      <section class="stack rule" aria-labelledby="same-boat">
        <h2 id="same-boat" class="display display-md kicker-accent">
          Same boat
        </h2>
        <PeerCards
          :peers="matches.sameBoat"
          :challenge-id="id"
          kind="same_boat"
          action="Connect"
          nobody="Nobody else is facing this yet."
        />
      </section>

      <section class="stack rule" aria-labelledby="been-there">
        <h2 id="been-there" class="display display-md">Been there</h2>
        <PeerCards
          :peers="matches.beenThere"
          :challenge-id="id"
          kind="been_there"
          action="Ask them"
          nobody="Nobody has offered experience here yet."
        />
      </section>

      <section class="stack rule" aria-labelledby="cases">
        <h2 id="cases" class="display display-md">Case studies</h2>
        <CaseList :cases="matches.cases" />
        <RouterLink
          :to="`/trends/${encodeURIComponent(matches.trend.id)}`"
          class="row-link"
          >About {{ matches.trend.short }}</RouterLink
        >
      </section>

      <div class="stack rule">
        <FollowButton :trend="matches.trend" />
      </div>
    </template>

    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
  </section>
</template>
