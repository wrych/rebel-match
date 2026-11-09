import { onMounted, shallowRef, type Ref, type ShallowRef } from 'vue'
import { fetchConfig, type ClientConfig } from './api'

/** What a screen reads from the limits the server enforces, read afresh on
 * every mount as hosts change some at any time (R-CFG-2, ADR 0031). It is
 * `fallback` until read and after a failed read, which writes `failure` to
 * `message` when given. Call from setup. */
export function useConfig<T, F>(
  read: (config: ClientConfig) => T,
  fallback: F,
): Readonly<ShallowRef<T | F>>
export function useConfig<T, F>(
  read: (config: ClientConfig) => T,
  fallback: F,
  message: Ref<string | null>,
  failure: string,
): Readonly<ShallowRef<T | F>>
export function useConfig<T, F>(
  read: (config: ClientConfig) => T,
  fallback: F,
  message?: Ref<string | null>,
  failure?: string,
): Readonly<ShallowRef<T | F>> {
  const value = shallowRef<T | F>(fallback)
  onMounted(async () => {
    try {
      value.value = read(await fetchConfig())
    } catch {
      if (message !== undefined && failure !== undefined)
        message.value = failure
    }
  })
  return value
}
