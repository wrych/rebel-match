<script setup lang="ts">
/** **Connect now** on S47: a live code replaced in place every
 * `showForSeconds`, a ring emptying as its time on screen runs out, and who
 * just connected. No code is asked for while the page is hidden, and none
 * offers Copy or Share (R-CODE-5, R-CODE-6). */
import { onMounted, onUnmounted, ref } from 'vue'
import { issueLiveCode, liveCodeLink, type IssuedCode } from '../lib/codes'
import QrCode from './QrCode.vue'

const props = defineProps<{ retrySeconds: number }>()
const emit = defineEmits<{ off: [] }>()

const MS_PER_SECOND = 1000

const code = ref<IssuedCode | null>(null)
const waiting = ref(false)
const connected = ref<string[]>([])
const problem = ref<string | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined
let gone = false
// One request at a time, so an older code can never arrive last.
let asking = false
const origin = window.location.origin

function later(seconds: number): void {
  clearTimeout(timer)
  timer = setTimeout(() => void next(), seconds * MS_PER_SECOND)
}

function show(issued: IssuedCode): void {
  code.value = issued
  waiting.value = false
  connected.value = [
    ...issued.connected.map((each) => each.name),
    ...connected.value,
  ]
  later(issued.showForSeconds)
}

// Refused, the code on screen may already have stopped working, so it is
// hidden until the next turn (R-CODE-5).
async function next(): Promise<void> {
  clearTimeout(timer)
  if (gone || document.hidden || asking) return
  asking = true
  try {
    const answer = await issueLiveCode()
    if (gone) return
    problem.value = null
    if (answer.result === 'off') emit('off')
    else if (answer.result === 'issued') show(answer.code)
    else {
      code.value = null
      waiting.value = true
      later(props.retrySeconds)
    }
  } catch {
    code.value = null
    problem.value = 'No code right now. Trying again in a moment.'
    later(props.retrySeconds)
  } finally {
    asking = false
  }
}

function onVisibility(): void {
  if (document.hidden) clearTimeout(timer)
  else void next()
}

onMounted(() => {
  document.addEventListener('visibilitychange', onVisibility)
  void next()
})

onUnmounted(() => {
  gone = true
  clearTimeout(timer)
  document.removeEventListener('visibilitychange', onVisibility)
})
</script>

<template>
  <div class="stack">
    <p class="lede">
      Let the other person scan this with their phone’s camera. You are
      connected at once, and both get each other’s email.
    </p>
    <div class="card code-card">
      <template v-if="code">
        <QrCode
          :value="liveCodeLink(origin, code.token)"
          label="Live connect code"
        />
        <svg
          :key="code.token"
          class="ring"
          viewBox="0 0 36 36"
          role="img"
          :aria-label="`Replaced every ${String(code.showForSeconds)} seconds`"
          :style="{ '--ring-seconds': `${String(code.showForSeconds)}s` }"
        >
          <circle class="ring-track" cx="18" cy="18" r="15.9" />
          <circle class="ring-time" cx="18" cy="18" r="15.9" />
        </svg>
      </template>
      <p v-else-if="waiting" class="small" role="status">
        A new code comes in a moment.
      </p>
      <p v-else-if="problem" class="small" role="status">{{ problem }}</p>
    </div>
    <section
      v-if="connected.length > 0"
      class="stack-tight"
      aria-labelledby="just-connected"
    >
      <h3 id="just-connected" class="kicker kicker-accent">Just connected</h3>
      <ul class="stack-tight plain">
        <li v-for="(name, index) in connected" :key="index">{{ name }}</li>
      </ul>
      <RouterLink to="/matches" class="row-link"
        >See them in your matches</RouterLink
      >
    </section>
  </div>
</template>

<style scoped>
.code-card {
  display: grid;
  justify-items: center;
  gap: 0.75rem;
  min-height: 12rem;
  align-content: center;
}

.ring {
  width: 2.5rem;
  height: 2.5rem;
  transform: rotate(-90deg);
}

.ring circle {
  fill: none;
  stroke-width: 3.5;
}

.ring-track {
  stroke: var(--line, currentColor);
  opacity: 0.2;
}

.ring-time {
  stroke: var(--accent);
  stroke-dasharray: 100;
  stroke-dashoffset: 0;
  animation: ring-empty var(--ring-seconds) linear forwards;
}

@keyframes ring-empty {
  to {
    stroke-dashoffset: 100;
  }
}

.plain {
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
