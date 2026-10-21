<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import HideForm from '../components/HideForm.vue'
import MemberBan from '../components/MemberBan.vue'
import {
  dismissReports,
  fetchModerationPage,
  hiddenAs,
  hideChallenge,
  hideNote,
  reasonLabel,
  unhideChallenge,
  unhideNote,
  type ModeratedItem,
  type ModerationAction,
  type ModerationItem,
  type ModerationPage,
  type ModerationReason,
} from '../lib/moderation'
import { when } from '../lib/when'

const route = useRoute()
const memberId = String(route.params.memberId)
const page = ref<ModerationPage | null>(null)
const missing = ref(false)
const problem = ref<string | null>(null)
const hiding = ref<string | null>(null)
const busy = ref(false)

const openOf = (item: ModerationItem): number =>
  item.reports.filter((report) => report.open).length
function itemOf(item: ModerationItem): ModeratedItem {
  if (item.kind === 'challenge') return { challengeId: item.id }
  return item.state === 'erased'
    ? { reportId: item.id }
    : { requestId: item.id }
}

const actionWords: Record<ModerationAction['kind'], string> = {
  hide: 'hid',
  unhide: 'unhid',
  dismiss: 'dismissed the reports about',
  ban: 'banned them',
  unban: 'lifted the ban',
}

function historyLine(action: ModerationAction): string {
  const who = action.actor ?? 'A former host'
  // An item erased since leaves the history naming none (R-MOD-11).
  const what =
    action.item === null
      ? action.kind === 'dismiss'
        ? ' an item since erased'
        : ''
      : action.item === 'challenge'
        ? ' a challenge'
        : ' a note'
  const why = action.reason === null ? '' : ` ${hiddenAs(action.reason)}`
  const note = action.note === null ? '' : `: “${action.note}”`
  return `${who} ${actionWords[action.kind]}${what}${why}${note}`
}

async function load(): Promise<void> {
  try {
    const found = await fetchModerationPage(memberId)
    page.value = found
    missing.value = found === null
  } catch {
    problem.value = 'This member’s reports could not be loaded.'
  }
}

// Each change ends by reading the page again, so it shows what the server
// now holds, a change another host made meanwhile included.
async function change(act: () => Promise<'done' | 'gone'>): Promise<void> {
  busy.value = true
  problem.value = null
  try {
    if ((await act()) === 'gone')
      problem.value = 'Someone changed that meanwhile. Here is how it is now.'
    hiding.value = null
  } catch {
    problem.value = 'That did not go through. Try again.'
  }
  busy.value = false
  await load()
}

function hide(item: ModerationItem, reason: ModerationReason): Promise<void> {
  return change(() =>
    item.kind === 'challenge'
      ? hideChallenge(item.id, reason)
      : hideNote(item.id, reason),
  )
}

function unhide(item: ModerationItem): Promise<void> {
  return change(() =>
    item.kind === 'challenge' ? unhideChallenge(item.id) : unhideNote(item.id),
  )
}

onMounted(load)
</script>

<template>
  <section class="screen">
    <RouterLink to="/admin/moderation" class="small back"
      >← Moderation</RouterLink
    >

    <p v-if="missing" class="empty">There is no such member.</p>

    <template v-else-if="page">
      <div class="stack">
        <p class="kicker kicker-accent">Host tools · Reported member</p>
        <h1 class="display display-lg">
          {{ page.member.name ?? page.member.email }}
        </h1>
        <p class="mono line">
          <template v-if="page.member.org">{{ page.member.org }} · </template
          >{{ page.member.status }} · joined
          <time :datetime="page.member.joinedAt">{{
            when(page.member.joinedAt)
          }}</time>
        </p>
        <RouterLink
          :to="`/admin/members/${encodeURIComponent(page.member.id)}`"
          class="small"
          >Open their member page</RouterLink
        >
      </div>

      <MemberBan
        :member-id="memberId"
        :name="page.member.name ?? page.member.email"
        :status="page.member.status"
        @changed="load"
      />

      <p class="notice notice-solid">
        {{ page.open.reports }} open reports from
        {{ page.open.reporters }} different members.
      </p>
      <p v-if="problem" class="alert" role="alert">{{ problem }}</p>

      <article v-for="item in page.items" :key="item.id" class="card">
        <span class="card-head">
          <span class="kicker">
            <template v-if="item.kind === 'challenge'"
              >Challenge · {{ item.trendShort ?? 'no trend' }}</template
            >
            <template v-else
              >Note · to {{ item.sentTo ?? 'a former member' }}</template
            >
          </span>
          <span v-if="item.state === 'erased'" class="chip">Erased</span>
          <span v-else-if="item.state === 'withdrawn'" class="chip"
            >Withdrawn</span
          >
          <span v-else-if="item.state === 'hidden'" class="chip chip-accent"
            >Hidden</span
          >
        </span>
        <p v-if="item.body === null" class="small">
          Withdrawn by its author; its text is theirs alone.
        </p>
        <p v-else class="mine">{{ item.body }}</p>
        <p v-if="item.state === 'erased'" class="small">
          Erased with the member it was sent to; this is the copy kept with the
          report.
        </p>
        <p v-if="item.state === 'hidden' && item.hiddenReason" class="small">
          Hidden {{ hiddenAs(item.hiddenReason) }}. Only its author sees it.
        </p>

        <ul class="reports">
          <li
            v-for="(report, at) in item.reports"
            :key="at"
            :class="{ handled: !report.open }"
          >
            <span
              ><strong>{{ reasonLabel(report.reason) }}</strong> ·
              {{ report.reporter ?? 'a former member' }}</span
            >
            <span v-if="report.comment" class="small"
              >“{{ report.comment }}”</span
            >
            <span class="mono"
              ><time :datetime="report.at">{{ when(report.at) }}</time
              ><template v-if="!report.open"> · handled</template></span
            >
          </li>
        </ul>

        <HideForm
          v-if="hiding === item.id"
          :busy="busy"
          :what="item.kind === 'challenge' ? 'The challenge' : 'The note'"
          @hide="(reason) => hide(item, reason)"
          @cancel="hiding = null"
        />
        <div v-else class="actions">
          <button
            v-if="item.state === 'shown' && item.body !== null"
            type="button"
            class="btn btn-dark btn-small"
            :disabled="busy"
            @click="hiding = item.id"
          >
            Hide…
          </button>
          <button
            v-if="item.state === 'hidden'"
            type="button"
            class="btn btn-ghost btn-small"
            :disabled="busy"
            @click="unhide(item)"
          >
            Unhide
          </button>
          <button
            v-if="openOf(item) > 0"
            type="button"
            class="btn btn-ghost btn-small"
            :disabled="busy"
            @click="change(() => dismissReports(itemOf(item)))"
          >
            Dismiss
          </button>
        </div>
      </article>

      <section class="stack-tight" aria-labelledby="history">
        <h2 id="history" class="kicker">History</h2>
        <p v-if="page.history.length === 0" class="small">
          No host has acted yet.
        </p>
        <ul class="history">
          <li v-for="(action, at) in page.history" :key="at" class="small">
            <time :datetime="action.at">{{ when(action.at) }}</time> —
            {{ historyLine(action) }}
          </li>
        </ul>
      </section>
    </template>

    <p v-else-if="problem" class="alert" role="alert">{{ problem }}</p>
  </section>
</template>

<style scoped>
.back {
  color: var(--muted);
}

.line {
  margin: 0;
  color: var(--muted);
  overflow-wrap: anywhere;
}

.reports,
.history {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.6rem;
}

.reports {
  border-top: 1px solid var(--line);
  padding-top: 0.6rem;
}

.reports li {
  display: grid;
  gap: 0.15rem;
}

.reports li.handled {
  color: var(--muted);
}
</style>
