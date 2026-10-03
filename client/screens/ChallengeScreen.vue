<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AskSteps from '../components/AskSteps.vue'
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
const sending = ref(false)
const problem = ref<string | null>(null)

const trend = computed(() =>
  challenge.value === null
    ? null
    : shownTrend(trends.value, challenge.value, picked),
)
const trendNumber = computed(
  () => trends.value.findIndex((each) => each.id === trend.value?.id) + 1,
)
const pickerPath = computed(() => {
  const base = `/challenges/${encodeURIComponent(id)}/trend`
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
  if (trend.value === null) return
  sending.value = true
  problem.value = null
  try {
    await confirmTrend(id, trend.value.id)
    await router.push(`/challenges/${encodeURIComponent(id)}/matches`)
  } catch {
    problem.value = 'That did not save. Try again.'
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <AskSteps :current="2" />
  <section class="screen">
    <p v-if="missing" class="empty">There is no challenge of yours here.</p>

    <template v-else-if="trend">
      <div class="stack">
        <h1 class="display display-lg">Your domain</h1>
        <p class="lede">
          We try to categorize each challenge under one of the 8 trends. This
          helps us find case studies and potential sparring partners for you.
          Please correct us if our assumption is wrong.
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
