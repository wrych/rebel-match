<script setup lang="ts">
import { computed, reactive } from 'vue'
import {
  readSocialLink,
  socialNetworks,
  type SocialLinks,
  type SocialNetwork,
} from '../../src/social-links'
import { useConfig } from '../lib/config'
import { saveSocialLinks } from '../lib/profile'
import SavedTick from './SavedTick.vue'

const props = defineProps<{ links: SocialLinks }>()

const labels: Readonly<Record<SocialNetwork, string>> = {
  linkedin: 'LinkedIn (optional)',
  instagram: 'Instagram (optional)',
}
const placeholders: Readonly<Record<SocialNetwork, string>> = {
  linkedin: 'https://www.linkedin.com/in/…',
  instagram: '@yourhandle',
}
const refusals: Readonly<Record<SocialNetwork, string>> = {
  linkedin:
    'That is not a LinkedIn profile (linkedin.com/in/…), so it was not saved.',
  instagram:
    'That is not an Instagram profile or @handle, so it was not saved.',
}

const typed = (): Record<SocialNetwork, string> => ({
  linkedin: props.links.linkedin ?? '',
  instagram: props.links.instagram ?? '',
})
const form = reactive(typed())
// What the server last accepted: a save sends it with the one link changed.
const saved = reactive(typed())
const ticks = reactive<Record<SocialNetwork, boolean>>({
  linkedin: false,
  instagram: false,
})
const errors = reactive<Record<SocialNetwork, string | null>>({
  linkedin: null,
  instagram: null,
})
const limits = useConfig(
  ({ limits }) => ({
    maxChars: limits.socialLinkMaxChars,
    tickMs: limits.savedTickMs,
  }),
  null,
)
const maxChars = computed(() => limits.value?.maxChars)
const tickMs = computed(() => limits.value?.tickMs ?? 0)
const timers: Partial<Record<SocialNetwork, ReturnType<typeof setTimeout>>> = {}
let queue: Promise<void> = Promise.resolve()

function tick(network: SocialNetwork): void {
  ticks[network] = true
  clearTimeout(timers[network])
  timers[network] = setTimeout(() => {
    ticks[network] = false
  }, tickMs.value)
}

async function store(network: SocialNetwork, value: string): Promise<void> {
  if (value === saved[network]) return
  try {
    await saveSocialLinks({ ...saved, [network]: value })
    saved[network] = value
    tick(network)
  } catch {
    errors[network] = 'That did not save. Try again.'
  }
}

function save(network: SocialNetwork): Promise<void> {
  errors[network] = null
  const reading = readSocialLink(
    network,
    form[network],
    maxChars.value ?? Number.POSITIVE_INFINITY,
  )
  if (reading.result === 'invalid') {
    errors[network] = refusals[network]
    return Promise.resolve()
  }
  const value = reading.result === 'link' ? reading.url : ''
  form[network] = value
  queue = queue.then(() => store(network, value))
  return queue
}
</script>

<template>
  <section class="stack-tight rule" aria-labelledby="social-heading">
    <h2 id="social-heading" class="kicker">Social links</h2>
    <div v-for="network in socialNetworks" :key="network" class="field">
      <div class="label-row">
        <label :for="`social-${network}`" class="label">{{
          labels[network]
        }}</label>
        <SavedTick :shown="ticks[network]" />
      </div>
      <input
        :id="`social-${network}`"
        v-model="form[network]"
        class="input"
        type="text"
        inputmode="url"
        autocomplete="url"
        :placeholder="placeholders[network]"
        :maxlength="maxChars"
        :aria-invalid="errors[network] !== null"
        @change="save(network)"
      />
      <p v-if="errors[network]" class="alert" role="alert">
        {{ errors[network] }}
      </p>
    </div>
    <p class="small">
      Shown only to members you are connected with, beside your email.
    </p>
  </section>
</template>

<style scoped>
.label-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
}
</style>
