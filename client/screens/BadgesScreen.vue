<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import BadgeArt from '../components/BadgeArt.vue'
import EventTicket from '../components/EventTicket.vue'
import {
  bestOf,
  earnedCount,
  fetchBadges,
  hasNew,
  hasNewEvent,
  markBadgesSeen,
  type BadgeOverview,
  type RowView,
} from '../lib/badges'
import { logoUrl } from '../lib/invites'

const overview = ref<BadgeOverview | null>(null)
const problem = ref<string | null>(null)

// The newest few, fanned out; the rest are on the event badges' screen.
const TICKETS_SHOWN = 3
const tickets = computed(() =>
  (overview.value?.events ?? []).slice(0, TICKETS_SHOWN),
)
const eventsNew = computed(() => hasNewEvent(overview.value?.events ?? []))

const eventsSummary = computed(() => {
  const n = overview.value?.events.length ?? 0
  return n === 0 ? 'None yet' : `${String(n)} earned`
})

const earned = computed(() =>
  overview.value === null ? 0 : earnedCount(overview.value),
)

function levelMarks(row: RowView): { level: number; on: boolean }[] {
  return row.levels.map((level) => ({
    level: level.level,
    on: level.earnedAt !== null,
  }))
}

function summary(row: RowView): string {
  const earnedLevels = row.levels.filter((l) => l.earnedAt !== null).length
  const crown = row.crown.held ? `, and its crown, ${row.crown.name}` : ''
  return `${row.title}: level ${String(earnedLevels)} of ${String(row.levels.length)}${crown}`
}

// What is new stays outlined for this visit; the server counts it seen from
// now on, so the menu clears (R-BADGE-10). A failed mark only leaves it new
// for next time.
onMounted(async () => {
  try {
    overview.value = await fetchBadges()
  } catch {
    problem.value = 'Your badges could not be loaded. Try again.'
    return
  }
  await markBadgesSeen([
    ...overview.value.rows.filter(hasNew).map((row) => row.row),
    ...(eventsNew.value ? (['event'] as const) : []),
  ]).catch(() => undefined)
})
</script>

<template>
  <section class="screen">
    <div class="title-row">
      <h1 class="display display-lg">Badges</h1>
      <p v-if="overview" class="kicker">{{ earned }} earned</p>
    </div>

    <section v-if="overview" class="stack" aria-labelledby="levels">
      <h2 id="levels" class="kicker">Your levels</h2>
      <ul class="tiles">
        <li v-for="row in overview.rows" :key="row.row">
          <RouterLink
            :to="`/badges/${row.row}`"
            class="card tile"
            :class="{ 'card-new': hasNew(row) }"
            :aria-label="summary(row)"
          >
            <span v-if="hasNew(row)" class="chip chip-accent new">New</span>
            <BadgeArt :row="row.row" :tier="bestOf(row).tier" :size="76" />
            <span class="card-title name">{{ bestOf(row).name }}</span>
            <span class="kicker">{{ row.title }}</span>
            <span class="marks" aria-hidden="true">
              <span
                v-for="mark in levelMarks(row)"
                :key="mark.level"
                class="mark-dot"
                :class="{ on: mark.on }"
              />
              <svg
                class="mark-crown"
                :class="{ on: row.crown.held }"
                width="14"
                height="12"
                viewBox="0 0 24 20"
              >
                <path d="M3 18 L2 4 L8 9 L12 2 L16 9 L22 4 L21 18 Z" />
              </svg>
            </span>
          </RouterLink>
        </li>
      </ul>
    </section>

    <section v-if="overview" class="stack" aria-labelledby="events">
      <h2 id="events" class="kicker">Event badges</h2>
      <RouterLink
        to="/badges/events"
        class="card events"
        :class="{ 'card-new': eventsNew }"
        :aria-label="`Event badges: ${eventsSummary}`"
      >
        <span v-if="eventsNew" class="chip chip-accent new">New</span>
        <span class="fan" aria-hidden="true">
          <EventTicket
            v-for="badge in tickets"
            :key="badge.id"
            :ticket-line="badge.ticketLine"
            :big-line="badge.bigLine"
            :logo="badge.hasLogo ? logoUrl(badge) : null"
            :size="64"
          />
          <EventTicket
            v-if="tickets.length === 0"
            class="locked"
            ticket-line="EVENT"
            big-line="?"
            :logo="null"
            :size="64"
          />
        </span>
        <span class="events-text">
          <span class="card-title">{{ eventsSummary }}</span>
          <span class="small">From the events you joined.</span>
        </span>
      </RouterLink>
    </section>

    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
  </section>
</template>

<style scoped>
.events {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.9rem;
  color: inherit;
  text-decoration: none;
}

.fan {
  display: flex;
}

.fan > * + * {
  margin-left: -28px;
}

.locked {
  opacity: 0.35;
  filter: grayscale(1);
}

.events-text {
  display: grid;
  gap: 0.2rem;
}

.tiles {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.6rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.tile {
  position: relative;
  justify-items: center;
  gap: 0.45rem;
  padding: 1.1rem 0.5rem 1rem;
  color: inherit;
  text-align: center;
  text-decoration: none;
}

.new {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
}

.name {
  min-height: 2.4em;
  display: flex;
  align-items: center;
}

.marks {
  display: flex;
  align-items: center;
  gap: 5px;
}

.mark-dot {
  width: 8px;
  height: 8px;
  border: 1.5px solid var(--line-strong);
  border-radius: 50%;
}

.mark-dot.on {
  border-color: var(--ink);
  background: var(--accent);
}

.mark-crown path {
  fill: none;
  stroke: var(--line-strong);
  stroke-width: 2.2;
  stroke-linejoin: round;
}

.mark-crown.on path {
  fill: var(--accent);
  stroke: var(--ink);
}
</style>
