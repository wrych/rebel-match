<script setup lang="ts">
import { onMounted, ref } from 'vue'
import {
  bodyParts,
  fetchOutbox,
  type OutboxEntry,
  type OutboxStatus,
} from '../lib/outbox'
import { when } from '../lib/when'

const to = ref('')
const status = ref<OutboxStatus | ''>('')
const entries = ref<OutboxEntry[]>([])
const problem = ref<string | null>(null)
const origin = window.location.origin

const chipFor: Record<OutboxStatus, string> = {
  recorded: 'chip-dashed',
  sent: 'chip-accent',
  suppressed: '',
  failed: 'chip-ink',
}

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
  <section class="screen">
    <div class="stack">
      <p class="kicker kicker-accent">Host tools</p>
      <h1 class="display display-lg">Outbound message log</h1>
      <p class="lede">Every email the app sends, and what became of it.</p>
    </div>

    <form class="filters" @submit.prevent="load">
      <div class="field">
        <label for="to">Recipient</label>
        <input
          id="to"
          v-model="to"
          class="input"
          type="email"
          autocomplete="off"
        />
      </div>
      <div class="field">
        <label for="status">Status</label>
        <select id="status" v-model="status" class="input">
          <option value="">any</option>
          <option value="recorded">recorded</option>
          <option value="sent">sent</option>
          <option value="suppressed">suppressed</option>
          <option value="failed">failed</option>
        </select>
      </div>
      <button type="submit" class="btn btn-dark">Filter</button>
    </form>

    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
    <p v-else-if="entries.length === 0" class="empty">
      Nothing in the log matches.
    </p>

    <article v-for="entry in entries" :key="entry.id" class="card">
      <div class="card-head">
        <span class="card-title">{{ entry.subject }}</span>
        <span :class="['chip', 'status', chipFor[entry.status]]">{{
          entry.status
        }}</span>
      </div>
      <p class="mono meta">
        To {{ entry.to }} · {{ entry.kind }} ·
        <time :datetime="entry.createdAt">{{ when(entry.createdAt) }}</time>
      </p>
      <p v-if="entry.error" class="alert">{{ entry.error }}</p>
      <details>
        <summary class="label">Message</summary>
        <pre><template v-for="(part, index) in bodyParts(entry.bodyText, origin)" :key="index"><a v-if="'href' in part" :href="part.href">{{ part.href }}</a><template v-else>{{ part.text }}</template></template></pre>
      </details>
    </article>
  </section>
</template>

<style scoped>
.filters {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: 0.6rem;
  align-items: end;
}

.filters .btn {
  grid-column: 1 / -1;
}

.meta {
  margin: 0;
  color: var(--muted);
  overflow-wrap: anywhere;
}

summary {
  cursor: pointer;
}

pre {
  margin: 0.6rem 0 0;
  padding: 0.8rem;
  border-radius: 10px;
  background: var(--paper);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

pre a {
  color: var(--accent);
  font-weight: 700;
}
</style>
