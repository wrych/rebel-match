<script setup lang="ts">
import { onMounted, ref } from 'vue'
import {
  bodyParts,
  fetchOutbox,
  type OutboxEntry,
  type OutboxStatus,
} from '../lib/outbox'

const to = ref('')
const status = ref<OutboxStatus | ''>('')
const entries = ref<OutboxEntry[]>([])
const problem = ref<string | null>(null)
const origin = window.location.origin

async function load(): Promise<void> {
  try {
    entries.value = await fetchOutbox({ to: to.value, status: status.value })
    problem.value = null
  } catch {
    problem.value = 'The log could not be loaded.'
  }
}

onMounted(load)
</script>

<template>
  <h1>Outbound message log</h1>

  <form @submit.prevent="load">
    <label for="to">Recipient</label>
    <input id="to" v-model="to" type="email" autocomplete="off" />
    <label for="status">Status</label>
    <select id="status" v-model="status">
      <option value="">any</option>
      <option value="recorded">recorded</option>
      <option value="sent">sent</option>
      <option value="suppressed">suppressed</option>
      <option value="failed">failed</option>
    </select>
    <button type="submit">Filter</button>
  </form>

  <p v-if="problem" role="alert">{{ problem }}</p>
  <p v-else-if="entries.length === 0">Nothing in the log matches.</p>

  <article v-for="entry in entries" :key="entry.id" class="entry">
    <header>
      <strong>{{ entry.subject }}</strong>
      <span :class="`status status-${entry.status}`">{{ entry.status }}</span>
    </header>
    <p>
      To {{ entry.to }} · {{ entry.kind }} ·
      <time :datetime="entry.createdAt">{{ entry.createdAt }}</time>
    </p>
    <p v-if="entry.error" class="error">{{ entry.error }}</p>
    <details>
      <summary>Message</summary>
      <pre><template v-for="(part, index) in bodyParts(entry.bodyText, origin)" :key="index"><a v-if="'href' in part" :href="part.href">{{ part.href }}</a><template v-else>{{ part.text }}</template></template></pre>
    </details>
  </article>
</template>

<style scoped>
form {
  display: grid;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.entry {
  border-top: 1px solid currentColor;
  padding: 0.5rem 0;
}

.entry header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}

pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
