<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import CaseList from '../components/CaseList.vue'
import FollowButton from '../components/FollowButton.vue'
import { fetchTrendDetail, type TrendDetail } from '../lib/challenges'

const route = useRoute()
const trendId = String(route.params.trendId)
const detail = ref<TrendDetail | null>(null)
const missing = ref(false)
const problem = ref<string | null>(null)

onMounted(async () => {
  try {
    detail.value = await fetchTrendDetail(trendId)
    missing.value = detail.value === null
  } catch {
    problem.value = 'This trend could not be loaded. Reload to try again.'
  }
})
</script>

<template>
  <section class="screen">
    <p v-if="missing" class="empty">There is no such trend.</p>

    <template v-else-if="detail">
      <div class="trend-card">
        <p class="kicker kicker-accent">Trend</p>
        <h1 class="trend-title">{{ detail.trend.short }}</h1>
        <p class="mono trend-from">
          {{ detail.trend.from }} → {{ detail.trend.short }}
        </p>
      </div>
      <p class="mono peers">
        {{ detail.trend.peers }} rebels work on this trend
      </p>

      <section class="stack rule" aria-labelledby="cases">
        <h2 id="cases" class="display display-md">Case studies</h2>
        <CaseList :cases="detail.cases" />
      </section>

      <div class="stack rule">
        <FollowButton :trend="detail.trend" />
      </div>
    </template>

    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
  </section>
</template>
