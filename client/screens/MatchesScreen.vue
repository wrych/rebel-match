<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import AskSteps from '../components/AskSteps.vue'
import PeerCards from '../components/PeerCards.vue'
import {
  fetchChallenge,
  fetchMatches,
  type Challenge,
  type Matches,
} from '../lib/challenges'
import { fetchFollowed, setFollowing } from '../lib/follows'

const route = useRoute()
const id = String(route.params.id)
const challenge = ref<Challenge | null>(null)
const matches = ref<Matches | null>(null)
const following = ref(false)
const missing = ref(false)
const saving = ref(false)
const problem = ref<string | null>(null)

onMounted(async () => {
  try {
    const [found, matched, followed] = await Promise.all([
      fetchChallenge(id),
      fetchMatches(id),
      fetchFollowed(),
    ])
    missing.value = found === null || matched === null
    challenge.value = found
    matches.value = matched
    following.value = followed.some((trend) => trend.id === matched?.trend.id)
  } catch {
    problem.value = 'Your matches could not be loaded. Reload to try again.'
  }
})

async function toggleFollow(): Promise<void> {
  if (matches.value === null) return
  saving.value = true
  problem.value = null
  try {
    await setFollowing(matches.value.trend.id, !following.value)
    following.value = !following.value
  } catch {
    problem.value = 'That did not save. Try again.'
  } finally {
    saving.value = false
  }
}
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
        <p v-if="matches.cases.length === 0" class="empty">
          No case studies for this trend yet.
        </p>
        <a
          v-for="study in matches.cases"
          :key="study.url"
          :href="study.url"
          target="_blank"
          rel="noopener noreferrer"
          class="case"
        >
          <span class="case-org">{{ study.org }}</span>
          <span class="case-takeaway">{{ study.takeaway }}</span>
        </a>
      </section>

      <div class="stack rule">
        <button
          type="button"
          class="btn"
          :class="following ? 'btn-dark' : 'btn-ghost'"
          :aria-pressed="following"
          :disabled="saving"
          @click="toggleFollow"
        >
          {{ following ? 'Following' : 'Follow' }} “{{ matches.trend.short }}”
        </button>
      </div>
    </template>

    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
  </section>
</template>
