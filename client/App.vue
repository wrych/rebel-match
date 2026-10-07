<script setup lang="ts">
import logo from './assets/corporate-rebels.png'
import HeaderMenu from './components/HeaderMenu.vue'
import TabBar from './components/TabBar.vue'
import { applyMood, currentMood as mood, savedMood } from './lib/mood'

applyMood(savedMood())

function toggleMood(): void {
  applyMood(mood.value === 'happy' ? 'calm' : 'happy')
}
</script>

<template>
  <div class="shell">
    <header class="bar">
      <RouterLink to="/" class="brand">
        <img :src="logo" alt="Corporate Rebels" width="43" height="19" />
      </RouterLink>
      <HeaderMenu :mood="mood" @toggle-mood="toggleMood" />
    </header>
    <main class="page">
      <RouterView />
    </main>
    <TabBar />
  </div>
</template>

<style>
@import './styles/theme.css';

.shell {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--paper);
  transition: background 0.25s ease;
}

@media (min-width: 640px) {
  body {
    padding: 2rem 1rem 3rem;
  }

  .shell {
    max-width: 440px;
    min-height: min(860px, calc(100dvh - 5rem));
    margin: 0 auto;
    border-radius: 38px;
    /* Clip rather than hide, so sticky bars still follow the page scroll. */
    overflow: clip;
    box-shadow:
      0 40px 80px -20px rgb(0 0 0 / 60%),
      0 0 0 1px #2e2c28;
  }
}

.bar {
  position: sticky;
  top: 0;
  z-index: 20;
  flex: 0 0 auto;
  height: var(--header-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.95rem 1.25rem 0.8rem;
  background: var(--ink);
}

.brand {
  display: block;
  line-height: 0;
}

.brand img {
  display: block;
  height: 19px;
  width: auto;
}

.cap {
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-display);
  font-size: 15px;
  letter-spacing: 0.02em;
  background: var(--cap-bg);
  color: var(--cap-fg);
  border: var(--cap-border);
  box-shadow: var(--cap-shadow);
  transform: var(--cap-tilt);
  cursor: pointer;
  transition: transform 0.2s cubic-bezier(0.2, 1.5, 0.4, 1);
}

.page {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
}

.page > * {
  flex: 1 1 auto;
}

/* Exempt from the stretch above, which is for screens, not chrome. */
.page > .steps {
  flex: 0 0 auto;
}
</style>
