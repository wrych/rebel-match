import { ref, type Ref } from 'vue'

/** A screen's action: `busy` while a run's body is under way, and the run's
 * failure text written to the message when the body throws. */
export interface Action {
  readonly busy: Readonly<Ref<boolean>>
  run(body: () => Promise<void>, failure: string): Promise<void>
}

/** Runs action bodies that report through `message`. What a body showed
 * stays; its failure text replaces it only when the body throws. */
export function useAction(message: Ref<string | null>): Action {
  const busy = ref(false)
  return {
    busy,
    async run(body, failure) {
      busy.value = true
      try {
        await body()
      } catch {
        message.value = failure
      } finally {
        busy.value = false
      }
    },
  }
}
