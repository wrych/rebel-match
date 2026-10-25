<template>
  <ul class="legend" aria-label="How to read the network">
    <li>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle class="dot" cx="12" cy="12" r="5" />
      </svg>
      <span>Each dot is a member</span>
    </li>
    <li>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <line class="line" x1="3" y1="18" x2="21" y2="6" />
        <circle class="dot" cx="3.5" cy="17.5" r="2.5" />
        <circle class="dot" cx="20.5" cy="6.5" r="2.5" />
      </svg>
      <span>Each line is a connection both of them accepted</span>
    </li>
    <li>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle class="orbit" cx="12" cy="12" r="8" />
        <circle class="dot" cx="12" cy="12" r="4" />
        <circle class="moon" cx="19.5" cy="9" r="2" />
      </svg>
      <span>Each moon is a challenge, circling the member who posted it</span>
    </li>
    <li>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle class="halo" cx="12" cy="12" r="8" />
        <circle class="self" cx="12" cy="12" r="5" />
      </svg>
      <span>You, in the accent colour; nobody else is named</span>
    </li>
  </ul>
</template>

<style scoped>
.legend {
  display: grid;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.9rem;
}

li {
  display: flex;
  align-items: center;
  gap: 0.7rem;
}

svg {
  flex: none;
  width: 1.6rem;
  height: 1.6rem;
}

.dot {
  fill: var(--ink);
}

.line {
  stroke: var(--muted);
  stroke-width: 1.5;
}

.orbit {
  fill: none;
  stroke: var(--line-strong);
  stroke-dasharray: 2 2;
}

.moon {
  fill: var(--faint);
}

.self {
  fill: var(--accent);
}

.halo {
  fill: none;
  stroke: var(--accent);
  stroke-width: 1;
  opacity: 0.6;
}
</style>
