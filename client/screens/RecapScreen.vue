<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import RecapStories from '../components/RecapStories.vue'
import { fetchConfig } from '../lib/api'
import { reportEvent } from '../lib/events'
import { fetchRecap, type Recap } from '../lib/recap'
import { loadMe } from '../lib/session'
import type { SharedVia } from '../recap/share'

const MS_PER_SECOND = 1000

const route = useRoute()
const router = useRouter()
const recap = ref<Recap | null>(null)
const name = ref('')
const storyMs = ref(0)
const networkStoryMs = ref(0)
const problem = ref<string | null>(null)
const site = window.location.origin

onMounted(async () => {
  try {
    const [found, me, config] = await Promise.all([
      fetchRecap(),
      loadMe().catch(() => null),
      fetchConfig(),
    ])
    if (found === null) {
      await router.replace({
        name: 'not-found',
        params: { pathMatch: route.path.slice(1).split('/') },
      })
      return
    }
    name.value = me?.name ?? 'Rebel'
    storyMs.value = config.limits.recapStorySeconds * MS_PER_SECOND
    networkStoryMs.value =
      config.limits.recapNetworkStorySeconds * MS_PER_SECOND
    recap.value = found
    reportEvent({ event: 'recap_opened', props: {} })
  } catch {
    problem.value = 'Your record could not be loaded.'
  }
})

function shared(via: SharedVia): void {
  reportEvent({ event: 'recap_shared', props: { via } })
}

async function close(): Promise<void> {
  const state = window.history.state as { back?: unknown } | null
  if (typeof state?.back === 'string') router.back()
  else await router.push({ name: 'cockpit' })
}
</script>

<template>
  <section class="screen">
    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
    <p v-else-if="!recap" class="empty">Gathering your record…</p>
    <RecapStories
      v-else
      :recap="recap"
      :name="name"
      :story-ms="storyMs"
      :network-story-ms="networkStoryMs"
      :site="site"
      @shared="shared"
      @close="close"
    />
  </section>
</template>
