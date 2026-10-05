<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
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
const matchesPath = `/challenges/${encodeURIComponent(challengeId)}/matches`

const peer = ref<PeerCard | null>(null)
const missing = ref(false)
const message = ref('')
const maxChars = ref<number | null>(null)
const sending = ref(false)
const outcome = ref<RequestOutcome['result'] | null>(null)
const problem = ref<string | null>(null)

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
  sending.value = true
  problem.value = null
  try {
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
  } catch {
    problem.value = 'That did not send. Try again.'
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <section class="screen">
    <p v-if="missing || outcome === 'not_found'" class="empty">
      There is nobody to ask here.
    </p>

    <template v-else-if="outcome === 'created' || outcome === 'exists'">
      <div class="stack">
        <p class="kicker kicker-accent">
          {{ outcome === 'created' ? 'Request sent' : 'Already asked' }}
        </p>
        <h1 class="display display-lg">Over to {{ firstName }}</h1>
        <p class="lede">
          {{
            outcome === 'created'
              ? `We let ${firstName} know.`
              : `You already asked ${firstName}, and they have not answered yet.`
          }}
          When they accept, you both get each other’s contact.
        </p>
      </div>
      <RouterLink :to="matchesPath" class="row-link"
        >Back to your matches</RouterLink
      >
    </template>

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
          Send request
        </button>
      </form>
      <RouterLink :to="matchesPath" class="btn btn-ghost">Cancel</RouterLink>
    </template>

    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
  </section>
</template>
