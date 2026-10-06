<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  answerCard,
  authorLine,
  fetchDeck,
  reportSeen,
  type DeckCard,
} from '../lib/deck'
import { contactPath } from '../lib/connections'
import { fetchFollowed } from '../lib/follows'
import { noticeFor } from '../lib/offer'
import { countAnswer } from '../lib/offer-session'

const router = useRouter()
const route = useRoute()
// A notification opens the deck at its challenge's card, once (R-OFF-7).
let openAt =
  typeof route.query['challenge'] === 'string'
    ? route.query['challenge']
    : undefined
const cards = ref<DeckCard[]>([])
const index = ref(0)
const sending = ref(false)
const notice = ref<string | null>(null)
const problem = ref<string | null>(null)
const followed = ref(new Set<string>())

const card = computed(() => cards.value[index.value])
const followsTopic = computed(
  () => card.value !== undefined && followed.value.has(card.value.trend.id),
)

// Each card that becomes the visible one is a view, the same card shown again
// included (R-STAT-1). Cards sent ahead but never shown are not.
watch(
  () => card.value?.challengeId,
  (shown) => {
    if (shown !== undefined) reportSeen(shown)
  },
)

async function load(): Promise<void> {
  try {
    cards.value = await fetchDeck(openAt)
    openAt = undefined
    index.value = 0
    if (cards.value.length === 0) await router.replace('/offer/done')
  } catch {
    problem.value = 'The challenges could not be loaded. Reload to try again.'
  }
}

// Unknown follows leave Follow offered: following twice changes nothing.
async function loadFollowed(): Promise<void> {
  try {
    followed.value = new Set((await fetchFollowed()).map((trend) => trend.id))
  } catch {
    followed.value = new Set()
  }
}

// What was said about one card would read as about the next, so it goes when
// the member moves on.
function clearMessages(): void {
  notice.value = null
  problem.value = null
}

function browse(step: -1 | 1): void {
  const next = index.value + step
  if (next < 0 || next >= cards.value.length) return
  index.value = next
  clearMessages()
}

// Arrow keys browse, as the prototype's arrow buttons do (R-OFF-1).
function onKey(event: KeyboardEvent): void {
  if (event.target instanceof HTMLTextAreaElement) return
  if (event.key === 'ArrowLeft') browse(-1)
  if (event.key === 'ArrowRight') browse(1)
}

// An answered card is never dealt again (R-OFF-2), so it leaves the hand;
// an empty hand asks the server whether more are waiting.
async function settle(answered: DeckCard): Promise<void> {
  cards.value = cards.value.filter((each) => each !== answered)
  if (index.value >= cards.value.length) index.value = 0
  if (cards.value.length === 0) await load()
}

async function answer(action: 'same_boat' | 'follow' | 'skip'): Promise<void> {
  const answered = card.value
  if (answered === undefined) return
  sending.value = true
  clearMessages()
  try {
    const result = await answerCard(answered.challengeId, action)
    if (result.result === 'joined') {
      countAnswer('sameBoat')
      await router.push(contactPath(result.id))
      return
    }
    notice.value = noticeFor(answered, action, result)
    if (result.result === 'recorded' && result.request === 'created')
      countAnswer('sameBoat')
    if (result.result === 'recorded' && action === 'follow') {
      countAnswer('follows')
      followed.value.add(answered.trend.id)
    }
    await settle(answered)
  } catch {
    problem.value = 'That did not save. Try again.'
  } finally {
    sending.value = false
  }
}

async function offerExperience(): Promise<void> {
  if (card.value === undefined) return
  const id = encodeURIComponent(card.value.challengeId)
  await router.push(`/offer/${id}/note`)
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  void load()
  void loadFollowed()
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <section class="screen">
    <p v-if="notice" class="notice notice-solid" role="status">{{ notice }}</p>

    <template v-if="card">
      <p class="footnote">
        {{ index + 1 }} of {{ cards.length }} · arrows or ‹ › to browse
      </p>

      <div class="deck">
        <button
          type="button"
          class="deck-arrow"
          aria-label="Previous challenge"
          :disabled="index === 0"
          @click="browse(-1)"
        >
          ‹
        </button>
        <article class="deck-card" aria-live="polite">
          <p class="kicker">{{ card.trend.short }}</p>
          <p class="deck-text">{{ card.body }}</p>
          <div class="deck-author">
            <span class="card-title">{{ card.author.name }}</span>
            <span v-if="authorLine(card)" class="mono">{{
              authorLine(card)
            }}</span>
          </div>
        </article>
        <button
          type="button"
          class="deck-arrow"
          aria-label="Next challenge"
          :disabled="index >= cards.length - 1"
          @click="browse(1)"
        >
          ›
        </button>
      </div>

      <div class="stack-tight">
        <button
          type="button"
          class="answer answer-same"
          :disabled="sending"
          @click="answer('same_boat')"
        >
          <span class="answer-title">Same boat</span>
          <span class="answer-body">I’m facing this, too</span>
        </button>
        <button
          type="button"
          class="answer answer-been"
          :disabled="sending"
          @click="offerExperience"
        >
          <span class="answer-title">Been there</span>
          <span class="answer-body">I can share experience</span>
        </button>
        <div class="actions">
          <button
            type="button"
            class="btn btn-ghost btn-small"
            :disabled="sending || followsTopic"
            @click="answer('follow')"
          >
            {{ followsTopic ? 'Following topic' : 'Follow topic' }}
          </button>
          <button
            type="button"
            class="btn btn-ghost btn-small"
            :disabled="sending"
            @click="answer('skip')"
          >
            Skip
          </button>
        </div>
      </div>
    </template>

    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
  </section>
</template>
