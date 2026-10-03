<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import AskSteps from '../components/AskSteps.vue'
import { fetchTrends, type Trend } from '../lib/challenges'

const route = useRoute()
const id = encodeURIComponent(String(route.params.id))
const current =
  typeof route.query.current === 'string' ? route.query.current : null
const trends = ref<Trend[]>([])
const problem = ref<string | null>(null)

onMounted(async () => {
  try {
    trends.value = await fetchTrends()
  } catch {
    problem.value = 'The trends could not be loaded. Reload to try again.'
  }
})
</script>

<template>
  <AskSteps :current="2" />
  <section class="screen">
    <div class="stack">
      <h1 class="display display-lg">All trends</h1>
      <p class="lede">Pick the one your challenge belongs to.</p>
    </div>

    <ol class="stack trend-list">
      <li v-for="(trend, index) in trends" :key="trend.id">
        <RouterLink
          :to="`/challenges/${id}?trend=${encodeURIComponent(trend.id)}`"
          class="trend-option"
          :class="{ chosen: trend.id === current }"
          :aria-current="trend.id === current ? 'true' : undefined"
        >
          <span class="mono trend-number">{{ index + 1 }}</span>
          <span class="trend-name">
            <span class="card-title">{{ trend.short }}</span>
            <span class="mono">from {{ trend.from }}</span>
          </span>
          <span class="mono trend-tag">{{
            trend.id === current
              ? 'Your challenge'
              : `${String(trend.peers)} rebels`
          }}</span>
        </RouterLink>
      </li>
    </ol>

    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
  </section>
</template>
