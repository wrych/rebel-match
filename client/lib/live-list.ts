import { onMounted, onUnmounted, reactive, ref, type Ref } from 'vue'
import { fetchConfig, type ClientConfig } from './api'
import { browserPage, poll, type Page } from './poll'

type Limits = ClientConfig['limits']

/** The setting that says how often a live list re-reads (R-NAV-12). */
export type PollLimit = {
  [K in keyof Limits]: K extends `${string}PollSeconds` ? K : never
}[keyof Limits]

/** Which entries a refresh brought that the first look did not, each until
 * it is tapped. Kept by the open screen only (R-NAV-12). */
export interface Arrivals<T> {
  see(items: readonly T[]): void
  /** Starts over, as a changed filter does: what shows next is not new. */
  forget(): void
  isNew(item: T): boolean
  clear(item: T): void
}

export function arrivals<T>(idOf: (item: T) => string): Arrivals<T> {
  let known: Set<string> | null = null
  const fresh = reactive(new Set<string>())
  return {
    see(items) {
      const ids = items.map(idOf)
      if (known === null) {
        known = new Set(ids)
        return
      }
      for (const id of ids) {
        if (known.has(id)) continue
        known.add(id)
        fresh.add(id)
      }
    },
    forget() {
      known = null
      fresh.clear()
    },
    isNew: (item) => fresh.has(idOf(item)),
    clear(item) {
      fresh.delete(idOf(item))
    },
  }
}

/** A screen's list kept fresh: `refresh` for a button or a pull, and the
 * pull's distance once the limits are read. */
export interface LiveList {
  readonly refreshing: boolean
  readonly pullPx: number | null
  refresh(): Promise<void>
}

const MS_PER_SECOND = 1000

// Asked for while a read is running, the read goes again once it is done,
// since the request may have changed what to read (a filter).
function oneAtATime(
  load: () => Promise<void>,
  busy: (running: boolean) => void,
  gone: () => boolean,
): { refresh: () => Promise<void>; idle: () => boolean } {
  let running: Promise<void> | null = null
  let again = false

  async function run(): Promise<void> {
    busy(true)
    try {
      do {
        again = false
        await load().catch(() => undefined)
      } while (again && !gone())
    } finally {
      running = null
      busy(false)
    }
  }

  return {
    refresh() {
      if (running !== null) {
        again = true
        return running
      }
      running = run()
      return running
    },
    idle: () => running === null,
  }
}

/** Runs `load` every `interval` seconds while the page is visible, and on
 * `refresh`, never twice at once. `load` reports its own failure; a failed
 * one keeps what is shown (R-NAV-12, ADR 0050). */
export function useLiveList(
  load: () => Promise<void>,
  interval: PollLimit,
  page: Page = browserPage,
): LiveList {
  let stopPolling: (() => void) | undefined
  let gone = false
  const reads = oneAtATime(
    load,
    (running) => (live.refreshing = running),
    () => gone,
  )
  const live = reactive({
    refreshing: false,
    pullPx: null as number | null,
    refresh: reads.refresh,
  })

  const tick = (): void => {
    if (reads.idle()) void reads.refresh()
  }

  // Without the limits the list still refreshes when asked to.
  onMounted(async () => {
    try {
      const { limits } = await fetchConfig()
      if (gone) return
      live.pullPx = limits.pullRefreshPx
      const seconds = limits[interval]
      if (seconds > 0) stopPolling = poll(tick, seconds * MS_PER_SECOND, page)
    } catch {
      live.pullPx = null
    }
  })

  onUnmounted(() => {
    gone = true
    stopPolling?.()
  })

  return live
}

/** What a live screen reads, and how to tell its arrivals apart. */
export interface LiveResourceOptions<T, I, E> {
  initial: E
  failure: string
  arrivals: { of: (found: T) => readonly I[]; id: (item: I) => string }
}

/** A live screen's read: what it shows, the first failure's text, whether a
 * read has ended, its arrivals, and `restart` for a new list. */
export interface LiveResource<T, I, E> {
  readonly data: Ref<T | E>
  readonly problem: Readonly<Ref<string | null>>
  readonly loaded: Readonly<Ref<boolean>>
  readonly arrived: Pick<Arrivals<I>, 'isNew' | 'clear'>
  readonly live: LiveList
  restart(): Promise<void>
}

/** Keeps what `fetch` reads live (`useLiveList`). A read that fails before
 * any has ended shows `failure`; a later one keeps what is shown and the
 * message as it was. Reads only when refreshed or polled (R-NAV-12). */
export function useLiveResource<T, I, E>(
  fetch: () => Promise<T>,
  interval: PollLimit,
  options: LiveResourceOptions<T, I, E>,
  page: Page = browserPage,
): LiveResource<T, I, E> {
  const data = ref(options.initial) as Ref<T | E>
  const problem = ref<string | null>(null)
  const loaded = ref(false)
  const arrived = arrivals(options.arrivals.id)

  async function load(): Promise<void> {
    try {
      const found = await fetch()
      arrived.see(options.arrivals.of(found))
      data.value = found
      problem.value = null
    } catch {
      if (!loaded.value) problem.value = options.failure
    }
    loaded.value = true
  }

  const live = useLiveList(load, interval, page)
  return {
    data,
    problem,
    loaded,
    arrived,
    live,
    restart() {
      arrived.forget()
      loaded.value = false
      data.value = options.initial
      return live.refresh()
    },
  }
}
