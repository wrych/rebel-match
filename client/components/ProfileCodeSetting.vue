<script setup lang="ts">
/** The profile screen's say over the member's profile code: on / off and
 * reset, and the way into Your code, both its tabs (R-CODE-1, R-CODE-4). */
import { onMounted, ref } from 'vue'
import { fetchProfileCode, type ProfileCode } from '../lib/codes'
import CodeIcon from './CodeIcon.vue'
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
    <h2 id="profile-code-heading" class="kicker">Your code</h2>
    <template v-if="code">
      <RouterLink to="/me/code" class="row-link">
        <span class="row-link-label"><CodeIcon live />Connect now</span>
      </RouterLink>
      <RouterLink to="/me/code?tab=profile" class="row-link">
        <span class="row-link-label"><CodeIcon />Share my profile</span>
      </RouterLink>
    </template>
    <ProfileCodeControls v-if="code" :code="code" @changed="code = $event" />
    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
  </section>
</template>
