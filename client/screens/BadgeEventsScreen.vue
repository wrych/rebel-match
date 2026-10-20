<script setup lang="ts">
import { onMounted, ref } from 'vue'
import EventTicket from '../components/EventTicket.vue'
import {
  fetchBadges,
  hasNewEvent,
  markBadgesSeen,
  type EarnedEventBadge,
} from '../lib/badges'
import { logoUrl } from '../lib/invites'
import { day } from '../lib/when'

const events = ref<EarnedEventBadge[] | null>(null)
const problem = ref<string | null>(null)

// Shown, they are no longer new (R-BADGE-10).
onMounted(async () => {
  try {
    events.value = (await fetchBadges()).events
  } catch {
    problem.value = 'Your event badges could not be loaded. Try again.'
    return
  }
  if (hasNewEvent(events.value))
    await markBadgesSeen(['event']).catch(() => undefined)
})
</script>

<template>
  <section class="screen">
    <RouterLink to="/badges" class="kicker back">← Badges</RouterLink>
    <h1 class="display display-lg">Event badges</h1>

    <ul v-if="events && events.length > 0" class="events">
      <li
        v-for="badge in events"
        :key="badge.id"
        class="card event"
        :class="{ 'card-new': badge.new }"
      >
        <EventTicket
          :ticket-line="badge.ticketLine"
          :big-line="badge.bigLine"
          :logo="badge.hasLogo ? logoUrl(badge) : null"
          :size="88"
        />
        <span class="event-text">
          <span class="card-title">{{ badge.name }}</span>
          <span class="small"
            >Earned
            <time :datetime="badge.earnedAt">{{
              day(badge.earnedAt)
            }}</time></span
          >
        </span>
        <span v-if="badge.new" class="chip chip-accent">New</span>
      </li>
    </ul>
    <p v-else-if="events" class="lede">
      None yet. Join an event through its invite link, or scan its code while
      signed in, and its badge shows here.
    </p>

    <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
  </section>
</template>

<style scoped>
.back {
  text-decoration: none;
}

.events {
  display: grid;
  gap: 0.6rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.event {
  display: flex;
  align-items: center;
  gap: 0.9rem;
}

.event-text {
  display: grid;
  flex: 1;
  gap: 0.2rem;
}
</style>
