<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { forgetMe } from '../lib/session'
import { signIn, tokenFromHash } from '../lib/sign-in'

const router = useRouter()
const token = tokenFromHash(window.location.hash)
const signingIn = ref(false)
const failed = ref(false)

// Opening the link uses nothing; only the button does (ADR 0027). Without a
// token there is nothing to confirm, so the login screen says so.
onMounted(async () => {
  if (token === null) await router.replace('/login?link=unknown')
})

async function confirm(): Promise<void> {
  if (token === null) return
  signingIn.value = true
  failed.value = false
  try {
    const result = await signIn(token)
    if (result.ok) {
      forgetMe()
      await router.replace(result.next)
    } else {
      await router.replace(`/login?link=${result.reason}`)
    }
  } catch {
    failed.value = true
  } finally {
    signingIn.value = false
  }
}
</script>

<template>
  <section class="screen screen-hero">
    <div class="stack">
      <p class="kicker kicker-accent">Your sign-in link</p>
      <h1 class="display display-lg">Sign in to Rebel Match</h1>
    </div>

    <div class="stack">
      <button
        type="button"
        class="btn btn-primary"
        :disabled="token === null || signingIn"
        @click="confirm"
      >
        Sign in
      </button>
      <p v-if="failed" class="alert" role="alert">
        That did not go through. Check your connection and try again.
      </p>
      <p class="small">
        One tap, so that the link checkers in your email cannot use your link
        before you do.
      </p>
    </div>
  </section>
</template>
