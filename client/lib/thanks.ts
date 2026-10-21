import { readonly, ref } from 'vue'

const message = ref<string | null>(null)
let arriving = false

/** A word of thanks the app shows on the screen a member goes back to, once
 * (R-MOD-4). */
export const thanks = readonly(message)

/** Shows `text` on the screen the next navigation lands on. */
export function thankOnReturn(text: string): void {
  message.value = text
  arriving = true
}

/** Run after each navigation: the thanks stays for the screen it was meant
 * for and goes with the one after. */
export function afterNavigation(): void {
  if (arriving) arriving = false
  else message.value = null
}
