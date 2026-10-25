import { describe, expect, it } from 'vitest'
import {
  createRecapAnnouncer,
  type RecapAnnounceStore,
} from './recap-announce.js'

function store(already = false): RecapAnnounceStore & { times: Date[] } {
  const times: Date[] = []
  return {
    times,
    announced: () => Promise.resolve(already || times.length > 0),
    announceOnce: (at) => {
      if (already || times.length > 0) return Promise.resolve(false)
      times.push(at)
      return Promise.resolve(true)
    },
  }
}

const at = new Date('2026-11-08T17:00:00Z')

describe('the recap’s announcement (R-RECAP-9)', () => {
  it('says nothing while the recap is closed, and reads nothing', async () => {
    const kept = store()
    let reads = 0
    const announcer = createRecapAnnouncer({
      store: {
        ...kept,
        announced: () => {
          reads += 1
          return kept.announced()
        },
      },
      open: () => false,
    })

    expect(await announcer.announce()).toBe(false)
    expect(reads).toBe(0)
  })

  it('tells everyone the first time it finds it open, and never again', async () => {
    const kept = store()
    let open = true
    const announcer = createRecapAnnouncer({
      store: kept,
      open: () => open,
      now: () => at,
    })

    expect(await announcer.announce()).toBe(true)
    open = false
    open = true
    expect(await announcer.announce()).toBe(false)
    expect(kept.times).toEqual([at])
  })

  it('stays quiet when another server or an earlier run told them', async () => {
    const kept = store(true)
    const announcer = createRecapAnnouncer({ store: kept, open: () => true })

    expect(await announcer.announce()).toBe(false)
    expect(await announcer.announce()).toBe(false)
    expect(kept.times).toEqual([])
  })
  it('tries again on the next run when writing failed', async () => {
    const kept = store()
    let fail = true
    const announcer = createRecapAnnouncer({
      store: {
        ...kept,
        announceOnce: (when) =>
          fail ? Promise.reject(new Error('down')) : kept.announceOnce(when),
      },
      open: () => true,
      now: () => at,
    })

    await expect(announcer.announce()).rejects.toThrow('down')
    fail = false
    expect(await announcer.announce()).toBe(true)
  })
})
