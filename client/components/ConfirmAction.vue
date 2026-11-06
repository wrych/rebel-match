<script setup lang="ts">
/** A "…" trigger that opens a warning (the default slot) with a do-it button
 * and a keep button. Emits `confirm`; `v-model:open` lets the caller close it.
 * `closedClass` wraps the trigger, after the `closed` slot, in a div. */
import type { FunctionalComponent } from 'vue'

withDefaults(
  defineProps<{
    triggerLabel?: string | undefined
    confirmLabel: string
    keepLabel: string
    busy: boolean
    triggerDisabled?: boolean
    closedClass?: string | undefined
  }>(),
  { triggerLabel: undefined, triggerDisabled: false, closedClass: undefined },
)
const emit = defineEmits<{ confirm: [] }>()
const open = defineModel<boolean>('open', { default: false })

const Bare: FunctionalComponent = (_, { slots }) => slots.default?.()
</script>

<template>
  <div v-if="open" class="stack-tight">
    <p class="alert" role="alert"><slot /></p>
    <div class="actions">
      <button
        type="button"
        class="btn btn-dark btn-small"
        :disabled="busy"
        @click="emit('confirm')"
      >
        {{ confirmLabel }}
      </button>
      <button
        type="button"
        class="btn btn-ghost btn-small"
        :disabled="busy"
        @click="open = false"
      >
        {{ keepLabel }}
      </button>
    </div>
  </div>
  <component
    :is="closedClass === undefined ? Bare : 'div'"
    v-else
    v-bind="closedClass === undefined ? {} : { class: closedClass }"
  >
    <slot name="closed" />
    <button
      v-if="triggerLabel !== undefined"
      type="button"
      class="btn btn-ghost btn-small"
      :disabled="triggerDisabled"
      @click="open = true"
    >
      {{ triggerLabel }}
    </button>
  </component>
</template>
