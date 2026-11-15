import { onMounted, shallowRef, type Ref, type ShallowRef } from 'vue'
import { fetchConfig, type ClientConfig } from './api'

let inFlight: Promise<ClientConfig> | null = null

/** A read of the config that every caller shares while it is in flight, so
 * many components mounted together ask once, and the next mount reads afresh
 * (R-LOOK-7, ADR 0031). */
export function sharedConfig(): Promise<ClientConfig> {
  inFlight ??= fetchConfig().finally(() => {
    inFlight = null
  })
  return inFlight
}

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
