<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import KindChip from '../components/KindChip.vue'
import PersonCard from '../components/PersonCard.vue'
import RequestSent from '../components/RequestSent.vue'
import { fetchConfig } from '../lib/api'
import {
  contactPath,
  requestConnection,
  type RequestOutcome,
} from '../lib/connections'
import { fetchMemberCard, personPath, type MemberCard } from '../lib/people'

const route = useRoute()
const router = useRouter()
const memberId = String(route.params['memberId'])

const card = ref<MemberCard | null>(null)
const missing = ref(false)
const message = ref('')
const maxChars = ref<number | null>(null)
const sending = ref(false)
const outcome = ref<RequestOutcome['result'] | null>(null)
const problem = ref<string | null>(null)

const firstName = computed(() => card.value?.name.split(' ')[0] ?? '')

onMounted(async () => {
  try {
    const [found, config] = await Promise.all([
      fetchMemberCard(memberId),
      fetchConfig(),
    ])
    card.value = found
    missing.value = found === null
    maxChars.value = config.limits.connectionMessageMaxChars
  } catch {
    problem.value = 'This could not be loaded. Reload to try again.'
  }
})

async function send(): Promise<void> {
  sending.value = true
  problem.value = null
  try {
    const sent = await requestConnection({
      targetId: memberId,
      kind: 'direct',
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

    <RequestSent
      v-else-if="outcome === 'created' || outcome === 'exists'"
      :first-name="firstName"
      :outcome="outcome"
      back-to="/people"
      back-label="Back to Find a member"
    />

    <template v-else-if="card">
      <div class="stack">
        <KindChip kind="direct" />
        <h1 class="display display-lg">Connect with {{ firstName }}</h1>
      </div>

      <PersonCard :card="card" />

      <p class="lede">
        Nothing is shared until {{ firstName }} accepts. Then you both get each
        other’s contact.
      </p>

      <p v-if="outcome === 'limit'" class="alert" role="alert">
        You have sent as many direct requests as a day allows. Try again
        tomorrow.
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
          :disabled="sending || maxChars === null || outcome === 'limit'"
        >
          Send request
        </button>
      </form>
      <RouterLink :to="personPath(memberId)" class="btn btn-ghost"
        >Cancel</RouterLink
      >
    </template>

    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
  </section>
</template>
