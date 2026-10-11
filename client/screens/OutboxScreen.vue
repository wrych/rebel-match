<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import PullToRefresh from '../components/PullToRefresh.vue'
import RefreshButton from '../components/RefreshButton.vue'
import { arrivals, useLiveList } from '../lib/live-list'
import {
  bodyParts,
  fetchOutbox,
  type OutboxEntry,
  type OutboxQuery,
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

// The filter last asked for, which every refresh keeps; a read begun under
// an earlier one is dropped (R-NAV-12).
let filter: OutboxQuery = {}
let asked = 0
const seen = arrivals<OutboxEntry>((entry) => entry.id)
const opened = reactive(new Set<string>())

async function load(): Promise<void> {
  const ask = asked
  try {
    const found = await fetchOutbox(filter)
    if (ask !== asked) return
    seen.see(found)
    // An arrival shows its message, so a sign-in link is one tap away (R-MSG-5).
    for (const entry of found) if (seen.isNew(entry)) opened.add(entry.id)
    entries.value = found
    problem.value = null
  } catch {
    if (ask === asked) problem.value = 'The log could not be loaded.'
  }
}

const live = useLiveList(load, 'outboxPollSeconds')

async function applyFilter(): Promise<void> {
  filter = { to: to.value, status: status.value }
  asked += 1
  seen.forget()
  opened.clear()
  await live.refresh()
}

function toggled(entry: OutboxEntry, event: Event): void {
  if ((event.target as HTMLDetailsElement).open) opened.add(entry.id)
  else opened.delete(entry.id)
}

onMounted(() => live.refresh())
</script>

<template>
  <section class="screen">
    <PullToRefresh :live="live" />
    <div class="stack">
      <p class="kicker kicker-accent">Host tools</p>
      <h1 class="display display-lg">Outbound message log</h1>
      <p class="lede">Every email the app sends, and what became of it.</p>
    </div>
    <RefreshButton :live="live" />

    <form class="filters" @submit.prevent="applyFilter">
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

    <article
      v-for="entry in entries"
      :key="entry.id"
      class="card"
      :class="{ 'card-new': seen.isNew(entry) }"
      @click="seen.clear(entry)"
    >
      <div class="card-head">
        <span class="card-title">{{ entry.subject }}</span>
        <span :class="['chip', 'status', chipFor[entry.status]]">{{
          entry.status
        }}</span>
      </div>
      <p class="mono meta">
        <span v-if="seen.isNew(entry)" class="new">New · </span>To
        {{ entry.to }} · {{ entry.kind }} ·
        <time :datetime="entry.createdAt">{{ when(entry.createdAt) }}</time>
      </p>
      <p v-if="entry.error" class="alert">{{ entry.error }}</p>
      <details :open="opened.has(entry.id)" @toggle="toggled(entry, $event)">
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

.new {
  font-weight: 700;
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
