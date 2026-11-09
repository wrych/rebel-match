<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PullToRefresh from '../components/PullToRefresh.vue'
import RefreshButton from '../components/RefreshButton.vue'
import { fetchConfig } from '../lib/api'
import { useLiveResource } from '../lib/live-list'
import {
  fetchReportedMembers,
  moderationPath,
  reasonLabel,
  type ReportedMember,
} from '../lib/moderation'
import { when } from '../lib/when'

const route = useRoute()
const router = useRouter()
const tab = computed<'open' | 'handled'>(() =>
  route.query['state'] === 'handled' ? 'handled' : 'open',
)
const toFlag = ref<number | null>(null)

const {
  data: members,
  problem,
  loaded,
  arrived,
  live,
  restart,
} = useLiveResource(
  () => fetchReportedMembers(tab.value),
  'moderationPollSeconds',
  {
    initial: [],
    failure: 'The reports could not be loaded.',
    arrivals: {
      of: (found) => found,
      id: (member: ReportedMember) => member.memberId,
    },
  },
)

const flagged = (member: ReportedMember): boolean =>
  tab.value === 'open' &&
  toFlag.value !== null &&
  member.reporters >= toFlag.value

const plural = (n: number, one: string, many: string): string =>
  `${String(n)} ${n === 1 ? one : many}`

function itemsLine(member: ReportedMember): string {
  return [
    member.challenges > 0
      ? plural(member.challenges, 'challenge', 'challenges')
      : '',
    member.notes > 0 ? plural(member.notes, 'note', 'notes') : '',
  ]
    .filter((part) => part !== '')
    .join(' · ')
}

function show(state: 'open' | 'handled'): void {
  void router.replace({ query: state === 'open' ? {} : { state } })
}

// A changed tab is a new list: nothing on it is new (R-NAV-12).
watch(tab, restart)

onMounted(async () => {
  toFlag.value = await fetchConfig()
    .then((config) => config.limits.reportersToFlag)
    .catch(() => null)
  await live.refresh()
})
</script>

<template>
  <section class="screen">
    <PullToRefresh :live="live" />
    <div class="stack">
      <p class="kicker kicker-accent">Host tools</p>
      <div class="title-row">
        <h1 class="display display-lg">Moderation</h1>
        <RefreshButton :live="live" />
      </div>
      <p class="lede">
        Members others reported, the most reporters first. Open one to see what
        was reported and act.
      </p>
    </div>

    <div role="tablist" aria-label="Reports" class="screen-tabs">
      <button
        type="button"
        role="tab"
        class="btn btn-small"
        :class="tab === 'open' ? 'btn-dark' : 'btn-ghost'"
        :aria-selected="tab === 'open'"
        @click="show('open')"
      >
        Open
      </button>
      <button
        type="button"
        role="tab"
        class="btn btn-small"
        :class="tab === 'handled' ? 'btn-dark' : 'btn-ghost'"
        :aria-selected="tab === 'handled'"
        @click="show('handled')"
      >
        Handled
      </button>
    </div>

    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
    <p v-else-if="loaded && members.length === 0" class="empty">
      {{
        tab === 'open'
          ? 'Nothing waits for a host.'
          : 'Nothing has been handled yet.'
      }}
    </p>

    <ul class="stack reported">
      <li v-for="member in members" :key="member.memberId">
        <RouterLink
          :to="moderationPath(member.memberId)"
          class="card reported-card"
          :class="{
            'card-new': arrived.isNew(member),
            flagged: flagged(member),
          }"
          @click="arrived.clear(member)"
        >
          <span class="card-head">
            <span class="stack-tight">
              <span class="card-title">{{ member.name ?? member.email }}</span>
              <span v-if="member.org" class="small">{{ member.org }}</span>
            </span>
            <span class="chip chip-dashed">{{ member.status }}</span>
          </span>
          <span class="count">
            <span class="display display-md">{{ member.reports }}</span>
            {{ member.reports === 1 ? 'report' : 'reports' }} from
            {{ plural(member.reporters, 'member', 'members') }}
          </span>
          <span v-if="itemsLine(member)" class="mono">{{
            itemsLine(member)
          }}</span>
          <span class="reasons">
            <span v-for="each in member.reasons" :key="each.reason" class="chip"
              >{{ reasonLabel(each.reason) }} ×{{ each.count }}</span
            >
          </span>
          <span class="small"
            >Latest
            <time :datetime="member.latestAt">{{
              when(member.latestAt)
            }}</time></span
          >
        </RouterLink>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.reported {
  list-style: none;
  margin: 0;
  padding: 0;
}

.reported-card {
  color: inherit;
  text-decoration: none;
}

.reported-card.flagged {
  outline: 3px solid var(--accent);
  outline-offset: -1px;
}

.count {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
}

.reasons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
</style>
