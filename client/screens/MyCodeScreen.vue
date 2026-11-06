<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CopyButton from '../components/CopyButton.vue'
import ProfileCodeControls from '../components/ProfileCodeControls.vue'
import QrCode from '../components/QrCode.vue'
import { fetchConfig } from '../lib/api'
import {
  fetchProfileCode,
  profileCodeLink,
  type ProfileCode,
} from '../lib/codes'
import { loadMe } from '../lib/session'

const route = useRoute()
const router = useRouter()
const code = ref<ProfileCode | null>(null)
const name = ref<string | null>(null)
const tickMs = ref<number | null>(null)
const problem = ref<string | null>(null)
const canShare = typeof navigator.share === 'function'

const link = computed(() =>
  code.value === null
    ? ''
    : profileCodeLink(window.location.origin, code.value.token),
)

async function share(): Promise<void> {
  try {
    await navigator.share({ title: 'Rebel Match', url: link.value })
  } catch {
    // Backing out of the share sheet is no failure to report.
  }
}

onMounted(async () => {
  try {
    const [mine, me, config] = await Promise.all([
      fetchProfileCode(),
      loadMe(),
      fetchConfig(),
    ])
    tickMs.value = config.limits.savedTickMs
    name.value = me?.name ?? null
    code.value = mine
    if (mine === null)
      await router.replace({
        name: 'not-found',
        params: { pathMatch: route.path.slice(1).split('/') },
      })
  } catch {
    problem.value = 'Your code could not be loaded. Reload to try again.'
  }
})
</script>

<template>
  <section class="screen">
    <div class="stack">
      <p class="kicker kicker-accent">Connect directly</p>
      <h1 class="display display-lg">Your code</h1>
    </div>

    <section v-if="code" class="stack" aria-labelledby="share-heading">
      <h2 id="share-heading" class="display display-md">Share my profile</h2>
      <p class="lede">
        Whoever scans or opens this sees your card and can ask to connect, even
        if you are not findable in search. Your email stays private until you
        accept.
      </p>
      <div class="card code-card" :class="{ off: !code.enabled }">
        <QrCode :value="link" :label="`Profile code of ${name ?? 'you'}`" />
        <p class="card-title">{{ name }}</p>
        <p v-if="!code.enabled" class="small">
          Your code is off: it answers as not found.
        </p>
      </div>
      <div class="actions">
        <span class="copy-link">
          <CopyButton :text="link" label="Copy link" :tick-ms="tickMs" />
          <span class="small" aria-hidden="true">Copy link</span>
        </span>
        <button
          v-if="canShare"
          type="button"
          class="btn btn-ghost btn-small"
          @click="share"
        >
          Share
        </button>
      </div>
      <ProfileCodeControls :code="code" @changed="code = $event" />
    </section>

    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
  </section>
</template>

<style scoped>
.code-card {
  display: grid;
  justify-items: center;
  gap: 0.75rem;
  text-align: center;
}

.code-card.off {
  opacity: 0.4;
}

.copy-link {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
</style>
