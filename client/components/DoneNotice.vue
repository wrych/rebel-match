<template>
  <p class="notice notice-ok done" role="status">
    <span class="tick" aria-hidden="true">✓</span>
    <span><slot /></span>
  </p>
</template>

<style scoped>
.done {
  display: flex;
  gap: 0.6rem;
  align-items: baseline;
}

.tick {
  flex: none;
  font-size: 1rem;
}
</style>
