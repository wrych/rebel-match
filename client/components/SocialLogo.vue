<template>
  <svg
    class="logo"
    viewBox="0 0 24 24"
    width="14"
    height="14"
    aria-hidden="true"
    focusable="false"
  >
    <rect class="fill" x="2" y="2" width="20" height="20" rx="3" />
    <g class="cut">
      <rect x="6" y="10" width="2.6" height="8" />
      <circle cx="7.3" cy="6.9" r="1.5" />
      <path
        d="M10.6 10h2.5v1.2c.5-.9 1.6-1.4 2.8-1.4 2.2 0 3.1 1.4 3.1 3.6V18h-2.6v-4.1c0-1.1-.4-1.8-1.4-1.8s-1.8.8-1.8 1.9V18h-2.6z"
      />
    </g>
  </svg>
</template>

<style scoped>
.logo {
  flex: none;
}

.fill {
  fill: currentColor;
}

.cut {
  fill: var(--field);
}
</style>
