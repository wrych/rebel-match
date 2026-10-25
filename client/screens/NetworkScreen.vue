<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import NetworkGraph from '../components/NetworkGraph.vue'
import { fetchNetwork, type NetworkTimeline } from '../lib/network'
import type { Frame } from '../network/replay'

const route = useRoute()
const router = useRouter()
const timeline = ref<NetworkTimeline | null>(null)
const problem = ref<string | null>(null)
const ended = ref(false)

function onFrame(shown: Frame): void {
  if (shown.progress < 1) ended.value = false
}

onMounted(async () => {
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
        Every dot is a member, every line a connection both of them accepted,
        every moon a challenge. Nobody is named. At the end, you are lit up.
      </p>
    </div>

    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
    <p v-else-if="timeline && timeline.nodes.length === 0" class="empty">
      Nobody has joined yet.
    </p>

    <template v-else-if="timeline">
      <NetworkGraph :timeline="timeline" @frame="onFrame" @end="ended = true" />
      <p v-if="ended" class="you" role="status">
        That’s you, in the accent colour, with your own connections.
      </p>
    </template>
  </section>
</template>

<style scoped>
.you {
  margin: 0;
  font-weight: 700;
}
</style>
