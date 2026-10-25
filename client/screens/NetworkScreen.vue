<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import NetworkGraph from '../components/NetworkGraph.vue'
import NetworkLegend from '../components/NetworkLegend.vue'
import {
  fetchNetwork,
  ownLinksHint,
  type NetworkTimeline,
} from '../lib/network'
import { loadMe } from '../lib/session'

const route = useRoute()
const router = useRouter()
const timeline = ref<NetworkTimeline | null>(null)
const problem = ref<string | null>(null)
const name = ref<string | null>(null)

onMounted(async () => {
  name.value = (await loadMe().catch(() => null))?.name ?? null
  try {
    timeline.value = await fetchNetwork()
    if (timeline.value === null)
      await router.replace({
        name: 'not-found',
        params: { pathMatch: route.path.slice(1).split('/') },
      })
  } catch {
    problem.value = 'The network could not be loaded.'
  }
})
</script>

<template>
  <section class="screen">
    <div class="stack">
      <p class="kicker kicker-accent">The network</p>
      <h1 class="display display-lg">How we grew</h1>
      <p class="lede">
        Watch the network grow, from its first members to today. At the end, it
        turns to you.
      </p>
    </div>

    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
    <p v-else-if="timeline && timeline.nodes.length === 0" class="empty">
      Nobody has joined yet.
    </p>

    <template v-else-if="timeline">
      <NetworkGraph :timeline="timeline" :self-name="name" />
      <p v-if="ownLinksHint(timeline.own)" class="hint">
        {{ ownLinksHint(timeline.own) }}
      </p>
      <NetworkLegend />
    </template>
  </section>
</template>

<style scoped>
.hint {
  margin: 0;
  color: var(--muted);
  font-size: 0.9rem;
}
</style>
