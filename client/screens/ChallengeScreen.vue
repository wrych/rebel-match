<script setup lang="ts">
import { pathTo } from '../../src/routes'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AskSteps from '../components/AskSteps.vue'
import { useAction } from '../lib/action'
import { askJourney } from '../lib/steps'
import {
  confirmTrend,
  fetchChallenge,
  fetchTrends,
  shownTrend,
  type Challenge,
  type Trend,
} from '../lib/challenges'

const route = useRoute()
const router = useRouter()
const id = String(route.params.id)
const picked = typeof route.query.trend === 'string' ? route.query.trend : null
const challenge = ref<Challenge | null>(null)
const trends = ref<Trend[]>([])
const missing = ref(false)
const problem = ref<string | null>(null)
const { busy: sending, run } = useAction(problem)

const trend = computed(() =>
  challenge.value === null
    ? null
    : shownTrend(trends.value, challenge.value, picked),
)
const trendNumber = computed(
  () => trends.value.findIndex((each) => each.id === trend.value?.id) + 1,
)
const pickerPath = computed(() => {
  const base = pathTo('trend-picker', { id })
  return trend.value === null
    ? base
    : `${base}?current=${encodeURIComponent(trend.value.id)}`
})

onMounted(async () => {
  try {
    const [found, all] = await Promise.all([fetchChallenge(id), fetchTrends()])
    missing.value = found === null
    challenge.value = found
    trends.value = all
  } catch {
    problem.value = 'Your challenge could not be loaded. Reload to try again.'
  }
})

async function confirm(): Promise<void> {
  const chosen = trend.value
  if (chosen === null) return
  problem.value = null
  await run(async () => {
    await confirmTrend(id, chosen.id)
    await router.push(`${pathTo('matches', { id })}?posted=1`)
  }, 'That did not save. Try again.')
}
</script>

<template>
  <AskSteps :journey="askJourney" :current="2" />
  <section class="screen">
    <p v-if="missing" class="empty">There is no challenge of yours here.</p>

    <template v-else-if="trend">
      <div class="stack">
        <h1 class="display display-lg">Your domain</h1>
        <p class="lede">
          We categorise each challenge under one of the trends typical of
          pioneering organisations. This helps us to find case studies and
          potential sparring partners for you. Please adjust if our assumption
          is incorrect.
        </p>
      </div>

      <div class="stack-tight">
        <div class="trend-card">
          <p class="kicker kicker-accent">
            Trend {{ trendNumber }} of {{ trends.length }}
          </p>
          <p class="trend-title">{{ trend.short }}</p>
          <p class="mono trend-from">{{ trend.from }} → {{ trend.short }}</p>
        </div>
        <p class="mono peers">{{ trend.peers }} rebels work on this trend</p>
      </div>

      <RouterLink :to="pickerPath" class="row-link"
        >See all {{ trends.length }} trends</RouterLink
      >
      <button
        type="button"
        class="btn btn-primary"
        :disabled="sending"
        @click="confirm"
      >
        Confirm
      </button>
    </template>

    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
  </section>
</template>
