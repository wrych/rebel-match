<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { peerLine } from '../lib/challenges'
import {
  answerRequest,
  fetchRequest,
  type ConnectionView,
} from '../lib/connections'

const route = useRoute()
const router = useRouter()
const id = String(route.params.id)
const contactPath = `/matches/requests/${encodeURIComponent(id)}/contact`

const request = ref<ConnectionView | null>(null)
const missing = ref(false)
const sending = ref(false)
const problem = ref<string | null>(null)
const stale = ref(false)

const waitingForMe = computed(
  () =>
    !stale.value &&
    request.value?.direction === 'incoming' &&
    request.value.status === 'pending',
)
const kindLabel = computed(() =>
  request.value?.kind === 'same_boat' ? 'Same boat' : 'Been there',
)
const statusLine = computed(() => {
  const view = request.value
  if (view === null || waitingForMe.value) return ''
  if (stale.value && view.status === 'pending') return ''
  if (view.status === 'declined') return 'This request is closed.'
  if (view.status === 'accepted') return 'You are connected.'
  return `Waiting for ${view.other.name} to answer.`
})

onMounted(async () => {
  try {
    request.value = await fetchRequest(id)
    missing.value = request.value === null
  } catch {
    problem.value = 'This request could not be loaded. Reload to try again.'
  }
})

// After a refused answer the request has moved on without us; re-read it,
// and if even that fails, at least stop offering an answer.
async function settleGone(): Promise<void> {
  problem.value = 'This request is no longer waiting for you.'
  stale.value = true
  try {
    request.value = await fetchRequest(id)
  } catch {
    // The notice above already says what matters.
  }
}

async function answer(verdict: 'accept' | 'decline'): Promise<void> {
  sending.value = true
  problem.value = null
  let outcome: 'done' | 'gone'
  try {
    outcome = await answerRequest(id, verdict)
  } catch {
    problem.value = 'That did not save. Try again.'
    sending.value = false
    return
  }
  sending.value = false
  if (outcome === 'gone') {
    await settleGone()
  } else if (verdict === 'accept') {
    await router.push(contactPath)
  } else if (request.value !== null) {
    request.value = { ...request.value, status: 'declined' }
  }
}
</script>

<template>
  <section class="screen">
    <p v-if="missing" class="empty">There is no request of yours here.</p>

    <template v-else-if="request">
      <div class="stack">
        <span
          class="chip"
          :class="request.kind === 'same_boat' ? 'chip-accent' : 'chip-ink'"
          >{{ kindLabel }}</span
        >
        <h1 class="display display-lg">
          {{
            request.direction === 'incoming'
              ? `${request.other.name} wants to connect`
              : `You asked ${request.other.name}`
          }}
        </h1>
      </div>

      <div class="card">
        <div class="stack-tight">
          <span class="card-title">{{ request.other.name }}</span>
          <span v-if="peerLine(request.other)" class="mono peer-meta">{{
            peerLine(request.other)
          }}</span>
        </div>
        <p v-if="request.message" class="small peer-note">
          “{{ request.message }}”
        </p>
      </div>

      <div v-if="request.challenge" class="stack-tight rule">
        <p class="kicker">
          About
          {{ request.challenge.trendShort ?? 'a challenge' }}
        </p>
        <p class="mine">{{ request.challenge.body }}</p>
      </div>

      <template v-if="waitingForMe">
        <p class="lede">
          If you accept, you both get each other’s email. If you decline,
          nothing is shared.
        </p>
        <div class="actions">
          <button
            type="button"
            class="btn btn-ghost"
            :disabled="sending"
            @click="answer('decline')"
          >
            Decline
          </button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="sending"
            @click="answer('accept')"
          >
            Accept
          </button>
        </div>
      </template>

      <template v-else>
        <p v-if="statusLine" class="notice notice-solid">{{ statusLine }}</p>
        <RouterLink
          v-if="request.status === 'accepted'"
          :to="contactPath"
          class="row-link"
          >Get in touch</RouterLink
        >
      </template>
    </template>

    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
  </section>
</template>
