<script setup lang="ts"></script>

<template>
  <main>
    <RouterView />
  </main>
</template>

<style>
:root {
  color-scheme: light dark;
  font-family: system-ui, sans-serif;
}

body {
  margin: 0;
}

main {
  margin: 0 auto;
  max-width: 32rem;
  padding: 1.5rem;
}
</style>
