<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchConfig } from '../lib/api'
import { contactPath } from '../lib/connections'
import { answerCard, authorLine, fetchDeck, type DeckCard } from '../lib/deck'
import { countAnswer } from '../lib/offer-session'

const route = useRoute()
const router = useRouter()
const challengeId = String(route.params.challengeId)
const card = ref<DeckCard | null>(null)
const missing = ref(false)
const note = ref('')
const limits = ref<{ min: number; max: number } | null>(null)
const sending = ref(false)
const sent = ref<'created' | 'exists' | null>(null)
const problem = ref<string | null>(null)

const first = computed(() => card.value?.author.name.split(' ')[0] ?? '')
// The server trims before it counts, so the counter does too (R-CFG-2).
const length = computed(() => note.value.trim().length)
const ready = computed(
  () =>
    limits.value !== null && length.value >= limits.value.min && !sending.value,
)

// Only a card still in the member's deck can be answered from here.
onMounted(async () => {
  try {
    const [deck, config] = await Promise.all([fetchDeck(), fetchConfig()])
    card.value = deck.find((each) => each.challengeId === challengeId) ?? null
    missing.value = card.value === null
    limits.value = {
      min: config.limits.beenThereNoteMinChars,
      max: config.limits.connectionMessageMaxChars,
    }
  } catch {
    problem.value = 'This could not be loaded. Reload to try again.'
  }
})

async function send(): Promise<void> {
  if (!ready.value) return
  sending.value = true
  problem.value = null
  try {
    const result = await answerCard(challengeId, 'been_there', note.value)
    if (result.result === 'joined') {
      countAnswer('beenThere')
      await router.replace(contactPath(result.id))
      return
    }
    if (result.result === 'gone') missing.value = true
    else sent.value = result.request ?? 'created'
    if (sent.value === 'created') countAnswer('beenThere')
  } catch {
    problem.value = 'That did not send. Try again.'
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <section class="screen">
    <p v-if="missing" class="empty">
      There is no open challenge to answer here.
    </p>

    <template v-else-if="sent">
      <div class="stack">
        <p class="kicker kicker-accent">
          {{ sent === 'created' ? 'Offer sent' : 'Already offered' }}
        </p>
        <h1 class="display display-lg">Over to {{ first }}</h1>
        <p class="lede">
          {{
            sent === 'created'
              ? `We passed your note to ${first}.`
              : `You already reached out to ${first}, and they have not answered yet.`
          }}
          When they accept, you both get each other’s contact.
        </p>
      </div>
      <RouterLink to="/offer" class="btn btn-primary"
        >Back to the deck</RouterLink
      >
    </template>

    <template v-else-if="card">
      <div class="stack">
        <span class="chip chip-ink">Been there</span>
        <h1 class="display display-lg">Offer to {{ first }}</h1>
      </div>

      <div class="card">
        <p class="kicker">{{ card.trend.short }}</p>
        <p class="small peer-note">{{ card.body }}</p>
        <span class="mono peer-meta"
          >{{ card.author.name
          }}<template v-if="authorLine(card)">
            · {{ authorLine(card) }}</template
          ></span
        >
      </div>

      <form class="stack" @submit.prevent="send">
        <div class="field">
          <label for="note">What can you offer?</label>
          <textarea
            id="note"
            v-model="note"
            class="input"
            rows="5"
            :maxlength="limits?.max"
            aria-describedby="note-hint note-count"
          ></textarea>
          <p id="note-count" class="footnote" aria-live="polite">
            {{ length }} characters<template v-if="limits">
              · at least {{ limits.min }}</template
            >
          </p>
        </div>
        <p id="note-hint" class="small">
          A line so {{ first }} knows what you bring. Nothing is shared until
          they accept; then you both get each other’s contact.
        </p>
        <button type="submit" class="btn btn-dark" :disabled="!ready">
          Send offer
        </button>
      </form>
      <RouterLink to="/offer" class="btn btn-ghost">Cancel</RouterLink>
    </template>

    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
  </section>
</template>
