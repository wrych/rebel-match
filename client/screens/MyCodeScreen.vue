<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CopyButton from '../components/CopyButton.vue'
import LiveCodePanel from '../components/LiveCodePanel.vue'
import ProfileCodeControls from '../components/ProfileCodeControls.vue'
import QrCode from '../components/QrCode.vue'
import { fetchConfig } from '../lib/api'
import {
  codesOpen,
  fetchProfileCode,
  profileCodeLink,
  type ProfileCode,
} from '../lib/codes'
import { renderCodeCard } from '../lib/code-card'
import { loadMe } from '../lib/session'
import { shareImage } from '../lib/share-sheet'

const route = useRoute()
const router = useRouter()
const code = ref<ProfileCode | null>(null)
const name = ref<string | null>(null)
const tickMs = ref<number | null>(null)
const problem = ref<string | null>(null)
const sharing = ref(false)
const cardFile = ref<File | null>(null)

const link = computed(() =>
  code.value === null
    ? ''
    : profileCodeLink(window.location.origin, code.value.token),
)

// Drawn once code and name are known, and again after a reset, so a tap
// on Share opens the sheet at once: iOS refuses one opened after a wait.
async function drawCard(): Promise<void> {
  cardFile.value = null
  if (link.value === '' || name.value === null) return
  const drawing = link.value
  try {
    const file = await renderCodeCard({
      name: name.value,
      link: drawing,
      site: window.location.origin,
    })
    if (drawing === link.value) cardFile.value = file
  } catch {
    problem.value = 'The card could not be drawn. Copy link still works.'
  }
}

watch([link, name], drawCard)

async function share(): Promise<void> {
  if (cardFile.value === null) return
  sharing.value = true
  problem.value = null
  try {
    await shareImage(
      cardFile.value,
      `Scan my code or open this link to connect on Rebel Match: ${link.value}`,
    )
  } catch {
    problem.value = 'The card could not be shared. Try Copy link instead.'
  } finally {
    sharing.value = false
  }
}

type Tab = 'profile' | 'now'

const tab = computed<Tab>(() =>
  route.query['tab'] === 'profile' ? 'profile' : 'now',
)
const retrySeconds = ref<number | null>(null)

function showTab(next: Tab): void {
  void router.replace({ query: next === 'now' ? {} : { tab: next } })
}

async function notFound(): Promise<void> {
  await router.replace({
    name: 'not-found',
    params: { pathMatch: route.path.slice(1).split('/') },
  })
}

// The profile code is made the first time its tab is opened (R-CODE-2).
async function loadProfileCode(): Promise<void> {
  if (tab.value !== 'profile' || code.value !== null) return
  try {
    const mine = await fetchProfileCode()
    if (mine === null) await notFound()
    else code.value = mine
  } catch {
    problem.value = 'Your code could not be loaded. Reload to try again.'
  }
}

watch(tab, loadProfileCode)

onMounted(async () => {
  try {
    const [me, config] = await Promise.all([loadMe(), fetchConfig()])
    if (!codesOpen(config.limits.connectCodes)) {
      await notFound()
      return
    }
    tickMs.value = config.limits.savedTickMs
    retrySeconds.value = config.limits.liveCodeSeconds
    name.value = me?.name ?? null
  } catch {
    problem.value = 'Your code could not be loaded. Reload to try again.'
    return
  }
  await loadProfileCode()
})
</script>

<template>
  <section class="screen">
    <div class="stack">
      <p class="kicker kicker-accent">Connect directly</p>
      <h1 class="display display-lg">Your code</h1>
    </div>

    <div role="tablist" aria-label="Your code" class="tabs">
      <button
        type="button"
        role="tab"
        class="btn btn-small"
        :class="tab === 'now' ? 'btn-dark' : 'btn-ghost'"
        :aria-selected="tab === 'now'"
        @click="showTab('now')"
      >
        Connect now
      </button>
      <button
        type="button"
        role="tab"
        class="btn btn-small"
        :class="tab === 'profile' ? 'btn-dark' : 'btn-ghost'"
        :aria-selected="tab === 'profile'"
        @click="showTab('profile')"
      >
        Share my profile
      </button>
    </div>

    <LiveCodePanel
      v-if="tab === 'now' && retrySeconds !== null"
      :retry-seconds="retrySeconds"
      :name="name ?? ''"
      @off="notFound"
    />

    <section
      v-else-if="tab === 'profile' && code"
      class="stack"
      aria-label="Share my profile"
    >
      <div class="card code-card" :class="{ off: !code.enabled }">
        <span class="corner">
          <CopyButton :text="link" label="Copy link" :tick-ms="tickMs" />
        </span>
        <QrCode :value="link" :label="`Profile code of ${name ?? 'you'}`" />
        <p class="card-title">{{ name }}</p>
        <p v-if="!code.enabled" class="small">
          Your code is off: it answers as not found.
        </p>
      </div>
      <button
        type="button"
        class="btn btn-primary"
        :disabled="sharing || cardFile === null || !code.enabled"
        @click="share"
      >
        Share
      </button>
      <p class="small">
        Whoever scans or opens it sees your card and can ask to connect, even if
        you are not findable in search. Your email stays private until you
        accept.
      </p>
      <ProfileCodeControls :code="code" @changed="code = $event" />
    </section>

    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
  </section>
</template>

<style scoped>
.code-card {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 0.75rem;
  text-align: center;
}

.code-card.off {
  opacity: 0.4;
}

.corner {
  position: absolute;
  top: 0.5rem;
  left: 0.5rem;
}
</style>
