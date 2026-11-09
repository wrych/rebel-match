<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchConfig } from '../lib/api'
import { codesOpen, redeemLiveCode, tokenOf } from '../lib/codes'
import { contactPath } from '../lib/connections'
import { loadMe } from '../lib/session'
import { useNotFound } from '../lib/not-found'

const route = useRoute()
const router = useRouter()
const notFound = useNotFound()
const state = ref<
  'connecting' | 'signed-out' | 'onboarding' | 'expired' | 'failed'
>('connecting')

async function use(token: string | null): Promise<void> {
  if (token === null) {
    state.value = 'expired'
    return
  }
  const redeemed = await redeemLiveCode(token)
  if (redeemed.result === 'connected')
    await router.replace(contactPath(redeemed.id))
  else if (redeemed.result === 'expired') state.value = 'expired'
  else await notFound()
}

// While hosts have codes off, the screen is not found to anyone (R-CODE-1).
onMounted(async () => {
  try {
    const [me, config] = await Promise.all([loadMe(), fetchConfig()])
    if (!codesOpen(config.limits.connectCodes)) {
      await notFound()
      return
    }
    // Signed out, the token is not kept for after: a live code lives
    // seconds and connects at once (R-CODE-7).
    if (me === null) {
      state.value = 'signed-out'
      return
    }
    if (!me.onboarded) {
      state.value = 'onboarding'
      return
    }
    await use(tokenOf(route.hash))
  } catch {
    state.value = 'failed'
  }
})
</script>

<template>
  <section class="screen">
    <div class="stack">
      <p class="kicker kicker-accent">Live connect code</p>
      <h1 v-if="state === 'connecting'" class="display display-lg">
        Connecting…
      </h1>
      <template v-else-if="state === 'signed-out'">
        <h1 class="display display-lg">Sign in to use live connect codes</h1>
        <p class="lede">
          Once you are in, ask for a fresh code and scan it again.
        </p>
        <RouterLink to="/login" class="btn btn-primary">Sign in</RouterLink>
      </template>
      <template v-else-if="state === 'onboarding'">
        <h1 class="display display-lg">
          Finish your profile to use live connect codes
        </h1>
        <p class="lede">Then ask for a fresh code and scan it again.</p>
        <RouterLink to="/onboarding" class="btn btn-primary"
          >Finish your profile</RouterLink
        >
      </template>
      <template v-else-if="state === 'expired'">
        <h1 class="display display-lg">
          This code has expired — ask for a fresh one
        </h1>
        <p class="lede">Live codes change every few seconds and work once.</p>
      </template>
      <p v-else class="alert" role="alert">
        That did not go through. Ask for a fresh code and try again.
      </p>
    </div>
  </section>
</template>
