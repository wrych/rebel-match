<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { adminLinksFor } from '../lib/admin-screens'
import type { Mood } from '../lib/mood'
import { forgetMe, loadMe, signOut, type Me } from '../lib/session'

const props = defineProps<{ mood: Mood }>()
const emit = defineEmits<{ toggleMood: [] }>()

const open = ref(false)
const me = ref<Me | null>(null)
const problem = ref<string | null>(null)
const root = ref<HTMLElement | null>(null)
const button = ref<HTMLButtonElement | null>(null)

const hostTools = computed(() =>
  me.value === null ? [] : adminLinksFor(me.value.permissions),
)

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
  close(false)
})
</script>

<template>
  <div ref="root" class="menu">
    <button
      ref="button"
      type="button"
      class="cap"
      aria-label="Menu"
      aria-controls="main-menu"
      :aria-expanded="open"
      @click="toggle"
    >
      <span class="bars" aria-hidden="true"><span /><span /><span /></span>
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
        to="/profile"
        class="item"
        @click="close(false)"
        >Profile &amp; privacy</RouterLink
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
    </div>
  </div>
</template>

<style scoped>
.menu {
  position: relative;
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
</style>
