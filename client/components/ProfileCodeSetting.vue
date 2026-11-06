<script setup lang="ts">
/** The profile screen's say over the member's profile code: on / off and
 * reset, and the way to show it (R-CODE-4). */
import { onMounted, ref } from 'vue'
import { fetchProfileCode, type ProfileCode } from '../lib/codes'
import ProfileCodeControls from './ProfileCodeControls.vue'

const code = ref<ProfileCode | null>(null)
const problem = ref<string | null>(null)

onMounted(async () => {
  try {
    code.value = await fetchProfileCode()
  } catch {
    problem.value = 'Your profile code could not be loaded.'
  }
})
</script>

<template>
  <section
    v-if="code || problem"
    class="stack-tight rule"
    aria-labelledby="profile-code-heading"
  >
    <h2 id="profile-code-heading" class="kicker">Profile code</h2>
    <ProfileCodeControls v-if="code" :code="code" @changed="code = $event" />
    <RouterLink v-if="code" to="/me/code?tab=profile" class="row-link"
      >Show your code</RouterLink
    >
    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
  </section>
</template>
