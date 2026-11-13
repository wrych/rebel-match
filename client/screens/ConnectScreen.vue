<script setup lang="ts">
import { pathTo } from '../../src/routes'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ConnectMark from '../components/ConnectMark.vue'
import RequestSent from '../components/RequestSent.vue'
import { useAction } from '../lib/action'
import { fetchConfig } from '../lib/api'
import { fetchMatches, peerLine, type PeerCard } from '../lib/challenges'
import {
  contactPath,
  kindOf,
  requestConnection,
  type RequestOutcome,
} from '../lib/connections'

const route = useRoute()
const router = useRouter()
const challengeId = String(route.params.challengeId)
const memberId = String(route.params.memberId)
const kind = kindOf(route.query.kind)
const matchesPath = pathTo('matches', { id: challengeId })

const peer = ref<PeerCard | null>(null)
const missing = ref(false)
const message = ref('')
const maxChars = ref<number | null>(null)
const outcome = ref<RequestOutcome['result'] | null>(null)
const problem = ref<string | null>(null)
const { busy: sending, run } = useAction(problem)

const firstName = computed(() => peer.value?.name.split(' ')[0] ?? '')

// Only someone on this challenge's matches, in the section the link names,
// can be asked from here.
async function findPeer(): Promise<PeerCard | null> {
  if (kind === null) return null
  const matches = await fetchMatches(challengeId)
  const section = kind === 'same_boat' ? matches?.sameBoat : matches?.beenThere
  return section?.find((each) => each.memberId === memberId) ?? null
}

onMounted(async () => {
  try {
    const [found, config] = await Promise.all([findPeer(), fetchConfig()])
    peer.value = found
    missing.value = found === null
    maxChars.value = config.limits.connectionMessageMaxChars
  } catch {
    problem.value = 'This could not be loaded. Reload to try again.'
  }
})

async function send(): Promise<void> {
  if (kind === null) return
  problem.value = null
  await run(async () => {
    const sent = await requestConnection({
      targetId: memberId,
      challengeId,
      kind,
      message: message.value,
    })
    if (sent.result === 'joined') {
      await router.replace(contactPath(sent.id))
      return
    }
    outcome.value = sent.result
  }, 'That did not send. Try again.')
}
</script>

<template>
  <section class="screen">
    <p v-if="missing || outcome === 'not_found'" class="empty">
      There is nobody to ask here.
    </p>

    <RequestSent
      v-else-if="outcome === 'created' || outcome === 'exists'"
      :first-name="firstName"
      :outcome="outcome"
      :back-to="matchesPath"
      back-label="Back to your matches"
    />

    <template v-else-if="peer">
      <div class="stack">
        <span
          class="chip"
          :class="kind === 'same_boat' ? 'chip-accent' : 'chip-ink'"
          >{{ kind === 'same_boat' ? 'Same boat' : 'Been there' }}</span
        >
        <h1 class="display display-lg">
          {{ kind === 'same_boat' ? 'Connect with' : 'Ask' }} {{ firstName }}
        </h1>
      </div>

      <div class="card peer">
        <div class="stack-tight">
          <span class="card-title">{{ peer.name }}</span>
          <span v-if="peerLine(peer)" class="mono peer-meta">{{
            peerLine(peer)
          }}</span>
        </div>
        <p class="small peer-note">{{ peer.note }}</p>
      </div>

      <p class="lede">
        Nothing is shared until {{ firstName }} accepts. Then you both get each
        other’s contact.
      </p>

      <form class="stack" @submit.prevent="send">
        <div class="field">
          <label for="message">A line for {{ firstName }} (optional)</label>
          <textarea
            id="message"
            v-model="message"
            class="input"
            rows="4"
            :maxlength="maxChars ?? undefined"
          ></textarea>
        </div>
        <button
          type="submit"
          class="btn btn-primary"
          :disabled="sending || maxChars === null"
        >
          <ConnectMark />Send request
        </button>
      </form>
      <RouterLink :to="matchesPath" class="btn btn-ghost">Cancel</RouterLink>
    </template>

    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
  </section>
</template>
