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
const frame = ref<Frame | null>(null)
const ended = ref(false)

const plural = (n: number, one: string, many: string): string =>
  `${String(n)} ${n === 1 ? one : many}`

function onFrame(shown: Frame): void {
  frame.value = shown
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
        Every dot is a member, every line a connection both of them accepted.
        Nobody is named. At the end, you are lit up.
      </p>
    </div>

    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
    <p v-else-if="timeline && timeline.nodes.length === 0" class="empty">
      Nobody has joined yet.
    </p>

    <template v-else-if="timeline">
      <NetworkGraph :timeline="timeline" @frame="onFrame" @end="ended = true" />
      <p v-if="frame" class="tally mono">
        {{ plural(frame.nodes, 'member', 'members') }} ·
        {{ plural(frame.links, 'connection', 'connections') }}
      </p>
      <p v-if="ended" class="you" role="status">
        That’s you, in the accent colour, with your own connections.
      </p>
    </template>
  </section>
</template>

<style scoped>
.tally {
  margin: 0;
  color: var(--muted);
  font-size: 0.85rem;
}

.you {
  margin: 0;
  font-weight: 700;
}
</style>
