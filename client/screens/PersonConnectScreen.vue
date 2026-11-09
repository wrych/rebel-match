<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import KindChip from '../components/KindChip.vue'
import PersonCard from '../components/PersonCard.vue'
import RequestSent from '../components/RequestSent.vue'
import { useAction } from '../lib/action'
import { fetchConfig } from '../lib/api'
import {
  contactPath,
  requestConnection,
  type RequestOutcome,
} from '../lib/connections'
import { profileCodePath } from '../lib/codes'
import { personPath, reachedFrom, type Reached } from '../lib/people'

const route = useRoute()
const router = useRouter()
const reached = ref<Reached | null>(null)
const card = computed(() => reached.value?.card ?? null)
const missing = ref(false)
const message = ref('')
const maxChars = ref<number | null>(null)
const outcome = ref<RequestOutcome['result'] | null>(null)
const problem = ref<string | null>(null)
const { busy: sending, run } = useAction(problem)

const firstName = computed(() => card.value?.name.split(' ')[0] ?? '')
const byCode = computed(() => (reached.value?.profileCode ?? null) !== null)
const cancelPath = computed(() => {
  if (reached.value === null) return '/people'
  const { card: shown, profileCode } = reached.value
  return profileCode === null
    ? personPath(shown.memberId)
    : profileCodePath(profileCode)
})

const photosOn = ref(false)

onMounted(async () => {
  try {
    const [found, config] = await Promise.all([
      reachedFrom(route),
      fetchConfig(),
    ])
    const joined = found?.card.connectionId ?? null
    if (joined !== null) {
      await router.replace(contactPath(joined))
      return
    }
    reached.value = found
    missing.value = found === null
    maxChars.value = config.limits.connectionMessageMaxChars
    photosOn.value = config.limits.profilePhotos === 1
  } catch {
    problem.value = 'This could not be loaded. Reload to try again.'
  }
})

async function send(): Promise<void> {
  const person = reached.value
  if (person === null) return
  problem.value = null
  await run(async () => {
    const sent = await requestConnection({
      targetId: person.card.memberId,
      kind: 'direct',
      message: message.value,
      profileCode: person.profileCode ?? undefined,
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
      :back-to="byCode ? '/matches' : '/people'"
      :back-label="byCode ? 'Back to your matches' : 'Back to Find a member'"
    />

    <template v-else-if="card">
      <div class="stack">
        <KindChip kind="direct" />
        <h1 class="display display-lg">Connect with {{ firstName }}</h1>
      </div>

      <PersonCard :card="card" :photos-on="photosOn" />

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
      <RouterLink :to="cancelPath" class="btn btn-ghost">Cancel</RouterLink>
    </template>

    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
  </section>
</template>
