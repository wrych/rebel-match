<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import BanForm from '../components/BanForm.vue'
import HideForm from '../components/HideForm.vue'
import {
  banMember,
  dismissReports,
  fetchModerationPage,
  hiddenAs,
  hideChallenge,
  hideNote,
  reasonLabel,
  unbanMember,
  unhideChallenge,
  unhideNote,
  type ModerationAction,
  type ModerationItem,
  type ModerationPage,
  type ModerationReason,
} from '../lib/moderation'
import { fetchConfig } from '../lib/api'
import { loadMe } from '../lib/session'
import { when } from '../lib/when'

const route = useRoute()
const memberId = String(route.params.memberId)
const page = ref<ModerationPage | null>(null)
const missing = ref(false)
const problem = ref<string | null>(null)
const hiding = ref<string | null>(null)
const busy = ref(false)
const banning = ref(false)
const mayBan = ref(false)
const banMaxChars = ref<number | null>(null)

const openOf = (item: ModerationItem): number =>
  item.reports.filter((report) => report.open).length
const itemOf = (
  item: ModerationItem,
):
  | { challengeId: string }
  | {
      requestId: string
    } =>
  item.kind === 'challenge' ? { challengeId: item.id } : { requestId: item.id }

const actionWords: Record<ModerationAction['kind'], string> = {
  hide: 'hid',
  unhide: 'unhid',
  dismiss: 'dismissed the reports about',
  ban: 'banned them',
  unban: 'lifted the ban',
}

function historyLine(action: ModerationAction): string {
  const who = action.actor ?? 'A former host'
  const what =
    action.item === null
      ? ''
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

const refusals = {
  done: null,
  gone: 'Someone changed that meanwhile. Here is how it is now.',
  refused: 'You cannot ban yourself, or the last member who can grant roles.',
} as const

// Each change ends by reading the page again, so it shows what the server
// now holds, a change another host made meanwhile included.
async function change(
  act: () => Promise<'done' | 'gone' | 'refused'>,
): Promise<void> {
  busy.value = true
  problem.value = null
  try {
    problem.value = refusals[await act()]
    hiding.value = null
    banning.value = false
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

// Banning needs its own permission, so the page offers it only to those
// who hold it (R-ROLE-4).
onMounted(async () => {
  await load()
  const me = await loadMe().catch(() => null)
  mayBan.value = me?.permissions.includes('member:ban') === true
  if (mayBan.value)
    banMaxChars.value =
      (await fetchConfig().catch(() => null))?.limits.banNoteMaxChars ?? null
})
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

      <template v-if="mayBan">
        <BanForm
          v-if="banning"
          :busy="busy"
          :name="page.member.name ?? page.member.email"
          :max-chars="banMaxChars"
          @ban="(note) => change(() => banMember(memberId, note))"
          @cancel="banning = false"
        />
        <div v-else class="actions">
          <button
            v-if="page.member.status === 'active'"
            type="button"
            class="btn btn-dark btn-small"
            :disabled="busy"
            @click="banning = true"
          >
            Ban member…
          </button>
          <button
            v-if="page.member.status === 'banned'"
            type="button"
            class="btn btn-ghost btn-small"
            :disabled="busy"
            @click="change(() => unbanMember(memberId))"
          >
            Lift ban
          </button>
        </div>
      </template>

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
          <span v-if="item.state === 'withdrawn'" class="chip">Withdrawn</span>
          <span v-else-if="item.state === 'hidden'" class="chip chip-accent"
            >Hidden</span
          >
        </span>
        <p v-if="item.body === null" class="small">
          Withdrawn by its author; its text is theirs alone.
        </p>
        <p v-else class="mine">{{ item.body }}</p>
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
