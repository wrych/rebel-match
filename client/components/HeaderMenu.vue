<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { adminLinksFor } from '../lib/admin-screens'
import { fetchConfig, type ClientConfig } from '../lib/api'
import { reportEvent } from '../lib/events'
import { feedbackMailto } from '../lib/feedback'
import type { Mood } from '../lib/mood'
import {
  fetchNewNotifications,
  menuLabel,
  NOTIFICATIONS_SEEN,
} from '../lib/notifications'
import { poll } from '../lib/poll'
import { forgetMe, loadMe, signOut, type Me } from '../lib/session'

const props = defineProps<{ mood: Mood }>()
const emit = defineEmits<{ toggleMood: [] }>()
const route = useRoute()

const open = ref(false)
const me = ref<Me | null>(null)
const version = ref<ClientConfig['build'] | null>(null)
const feedbackTo = ref<string | null>(null)
const fresh = ref(0)
let stopPolling: (() => void) | undefined
let gone = false

const MS_PER_SECOND = 1000

// Nobody signed in, or not yet onboarded, reads as nothing new (R-NOTE-6).
async function readFresh(): Promise<void> {
  fresh.value = await fetchNewNotifications().catch(() => 0)
}

// Refreshed as the matches badge is, and at once when the notifications
// screen has marked what it listed (R-NOTE-6, R-MINE-4).
onMounted(async () => {
  window.addEventListener(NOTIFICATIONS_SEEN, readFresh)
  void readFresh()
  const config = await fetchConfig().catch(() => null)
  if (config === null || gone) return
  remember(config)
  stopPolling = poll(() => {
    void readFresh()
  }, config.limits.matchesPollSeconds * MS_PER_SECOND)
})
const problem = ref<string | null>(null)
const root = ref<HTMLElement | null>(null)
const button = ref<HTMLButtonElement | null>(null)

const hostTools = computed(() =>
  me.value === null ? [] : adminLinksFor(me.value.permissions),
)
const screen = computed(() => String(route.name ?? 'unknown'))
const feedback = computed(() =>
  feedbackTo.value === null || me.value?.onboarded !== true
    ? null
    : feedbackMailto(feedbackTo.value, screen.value),
)

function remember(config: ClientConfig): void {
  version.value = config.build
  feedbackTo.value = config.feedbackTo
}

function feedbackOpened(): void {
  reportEvent({ event: 'feedback_opened', props: { screen: screen.value } })
  close(false)
}

function onOutside(event: MouseEvent): void {
  if (!root.value?.contains(event.target as Node)) close(false)
}

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') close(true)
}

async function show(): Promise<void> {
  open.value = true
  problem.value = null
  document.addEventListener('click', onOutside)
  document.addEventListener('keydown', onKey)
  // Asked afresh on every opening: a session can end in another tab or
  // expire, and the menu must not offer what is no longer there.
  forgetMe()
  // The version cannot change under an open page, so it is read once; a
  // failed read shows none and the next opening tries again (R-NFR-11).
  if (version.value === null)
    void fetchConfig()
      .then(remember)
      .catch(() => undefined)
  void readFresh()
  me.value = await loadMe().catch(() => null)
}

function close(refocus: boolean): void {
  open.value = false
  document.removeEventListener('click', onOutside)
  document.removeEventListener('keydown', onKey)
  if (refocus) void nextTick(() => button.value?.focus())
}

function toggle(): void {
  if (open.value) close(true)
  else void show()
}

async function leave(): Promise<void> {
  try {
    await signOut()
  } catch {
    problem.value = 'You are still signed in: signing out failed. Try again.'
    return
  }
  window.location.assign('/login')
}

onBeforeUnmount(() => {
  gone = true
  stopPolling?.()
  window.removeEventListener(NOTIFICATIONS_SEEN, readFresh)
  close(false)
})
</script>

<template>
  <div ref="root" class="menu">
    <button
      ref="button"
      type="button"
      class="cap"
      :aria-label="
        fresh > 0 ? `Menu, ${String(fresh)} new notifications` : 'Menu'
      "
      aria-controls="main-menu"
      :aria-expanded="open"
      @click="toggle"
    >
      <span class="bars" aria-hidden="true"><span /><span /><span /></span>
      <span v-if="fresh > 0" class="badge menu-badge" aria-hidden="true">{{
        fresh
      }}</span>
    </button>

    <div v-if="open" id="main-menu" class="panel">
      <button
        type="button"
        role="switch"
        class="item"
        :aria-checked="props.mood === 'happy'"
        @click="emit('toggleMood')"
      >
        <span>Happy colour mode</span>
        <span class="state" aria-hidden="true">{{
          props.mood === 'happy' ? 'On' : 'Off'
        }}</span>
      </button>

      <RouterLink
        v-if="me?.onboarded"
        to="/notifications"
        class="item"
        @click="close(false)"
        >{{ menuLabel(fresh) }}</RouterLink
      >

      <RouterLink
        v-if="me?.onboarded"
        to="/profile"
        class="item"
        @click="close(false)"
        >Profile &amp; privacy</RouterLink
      >

      <a
        v-if="feedback"
        :href="feedback"
        class="item item-feedback"
        @click="feedbackOpened"
        >Feedback</a
      >

      <RouterLink to="/impressum" class="item" @click="close(false)"
        >Impressum</RouterLink
      >

      <nav v-if="hostTools.length > 0" aria-label="Host tools" class="group">
        <p class="kicker">Host tools</p>
        <RouterLink
          v-for="link in hostTools"
          :key="link.path"
          :to="link.path"
          class="item"
          @click="close(false)"
          >{{ link.label }}</RouterLink
        >
      </nav>

      <div v-if="me" class="group">
        <button type="button" class="item" @click="leave">Sign out</button>
        <p v-if="problem" class="alert" role="alert">{{ problem }}</p>
      </div>

      <p v-if="version" class="version">
        Version
        <a
          v-if="version.url"
          :href="version.url"
          target="_blank"
          rel="noopener noreferrer"
          >{{ version.commit }}</a
        >
        <template v-else>{{ version.commit }}</template>
      </p>
    </div>
  </div>
</template>

<style scoped>
.menu {
  position: relative;
}

.cap {
  position: relative;
}

.menu-badge {
  position: absolute;
  top: -0.35rem;
  right: -0.35rem;
}

.bars {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.bars span {
  display: block;
  width: 16px;
  height: 2px;
  border-radius: 1px;
  background: currentcolor;
}

.panel {
  position: absolute;
  top: calc(100% + 0.5rem);
  right: 0;
  z-index: 10;
  min-width: 15rem;
  display: flex;
  flex-direction: column;
  padding: 0.4rem;
  border-radius: 14px;
  background: var(--paper);
  color: var(--ink);
  box-shadow: 0 12px 32px -8px rgb(0 0 0 / 45%);
}

.group {
  display: flex;
  flex-direction: column;
  padding-top: 0.4rem;
  margin-top: 0.3rem;
  border-top: 1px solid var(--line);
}

.group .kicker {
  margin: 0.2rem 0.75rem 0.1rem;
}

.item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  width: 100%;
  padding: 0.7rem 0.75rem;
  border: 0;
  border-radius: 10px;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
}

.item:hover,
.item:focus-visible {
  background: var(--line);
}

.state {
  font-size: 0.85em;
  color: var(--muted);
}

.alert {
  margin: 0.4rem 0.75rem;
}

.version {
  margin: 0.4rem 0.75rem 0.2rem;
  font-size: 0.75em;
  color: var(--muted);
}

.version a {
  color: inherit;
  font-family: var(--font-mono);
}
</style>
