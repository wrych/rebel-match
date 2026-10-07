<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import type { DayState } from './core/state'
import { present } from './core/walk'

/** Choosing the grey colleagues sent to a masterclass, by tapping them on
 * the floor or from this list (R-GAME-11, R-GAME-12). */
const props = defineProps<{ state: DayState; chosen: readonly number[] }>()
const emit = defineEmits<{
  toggle: [id: number]
  send: []
  cancel: []
}>()

const list = ref<HTMLElement | null>(null)

function buttons(): HTMLButtonElement[] {
  return [...(list.value?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
}

function moveFocus(event: KeyboardEvent): void {
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[
    event.key
  ]
  if (step === undefined) return
  event.preventDefault()
  const all = buttons()
  const at = all.findIndex((button) => button === document.activeElement)
  all[(at + step + all.length) % all.length]?.focus()
}

onMounted(async () => {
  await nextTick()
  buttons()[0]?.focus()
})

const seats = computed(() => props.state.tuning['rebel.masterclassSeats'])
const greys = computed(() =>
  props.state.employees.filter((e) => e.spirit === 'grey' && present(e)),
)
</script>

<template>
  <div class="picker" role="dialog" aria-label="Masterclass">
    <p class="mono">
      Tap up to {{ seats }} grey colleagues, or choose them here
    </p>
    <div ref="list" class="greys" @keydown="moveFocus">
      <button
        v-for="grey in greys"
        :key="grey.id"
        type="button"
        class="grey"
        :aria-pressed="chosen.includes(grey.id)"
        :disabled="!chosen.includes(grey.id) && chosen.length >= seats"
        @click="emit('toggle', grey.id)"
      >
        Desk {{ grey.cubicle + 1 }}
      </button>
    </div>
    <div class="row">
      <button
        type="button"
        class="btn btn-dark"
        :disabled="chosen.length === 0"
        @click="emit('send')"
      >
        Send to the masterclass
      </button>
      <button type="button" class="btn btn-ghost" @click="emit('cancel')">
        Not now
      </button>
    </div>
  </div>
</template>

<style scoped>
.picker {
  position: absolute;
  left: 50%;
  bottom: 1rem;
  transform: translateX(-50%);
  display: grid;
  gap: 0.6rem;
  max-width: min(36rem, calc(100% - 2rem));
  padding: 0.8rem 1rem;
  border-radius: 16px;
  background: rgb(250 248 244 / 95%);
  color: #111010;
}

.greys,
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.grey {
  min-height: 2.75rem;
  padding: 0 0.8rem;
  border: 2px solid #111010;
  border-radius: 999px;
  background: transparent;
  font-weight: 700;
}

.grey[aria-pressed='true'] {
  background: var(--accent);
  color: var(--on-accent);
  border-color: var(--accent);
}
</style>
