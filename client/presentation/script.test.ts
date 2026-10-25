import { describe, expect, it } from 'vitest'
import { devCast } from '../../src/presentation/dev-cast'
import type { Cue } from './director'
import { script } from './script'

const startOf = (cue: Cue): number => ('at' in cue ? cue.at : cue.from)
const endOf = (cue: Cue): number => ('to' in cue ? cue.to : cue.at)

function handlesIn(cue: Cue): string[] {
  if (cue.kind === 'label') return Array.isArray(cue.who) ? cue.who : []
  if (cue.kind === 'camera' && cue.aim.on === 'person') return [cue.aim.who]
  if (cue.kind === 'light' && cue.what.on === 'person') return [cue.what.who]
  return []
}

function groupsIn(cue: Cue): string[] {
  if (cue.kind === 'label' && !Array.isArray(cue.who)) return [cue.who.group]
  if (cue.kind === 'camera' && cue.aim.on === 'group') return [cue.aim.group]
  if (cue.kind === 'light' && cue.what.on === 'group') return [cue.what.group]
  return []
}

describe('the summit script (R-PRES-2)', () => {
  it('keeps every cue within the film, each ending after it starts', () => {
    for (const cue of script.cues) {
      expect(startOf(cue)).toBeGreaterThanOrEqual(0)
      expect(endOf(cue)).toBeLessThanOrEqual(script.length)
      expect(endOf(cue)).toBeGreaterThanOrEqual(startOf(cue))
    }
  })

  it('never shows two lines of words at once', () => {
    const lines = script.cues
      .filter((cue) => cue.kind === 'words')
      .sort((a, b) => startOf(a) - startOf(b))
    lines.slice(1).forEach((cue, index) => {
      expect(startOf(cue)).toBeGreaterThanOrEqual(endOf(lines[index] as Cue))
    })
  })

  it('names only handles and groups the dev cast stands in for (R-PRES-5)', () => {
    const handles = new Set(devCast.map((entry) => entry.handle))
    const groups = new Set(devCast.flatMap((entry) => entry.groups))
    for (const cue of script.cues) {
      for (const handle of handlesIn(cue)) expect(handles).toContain(handle)
      for (const group of groupsIn(cue)) expect(groups).toContain(group)
    }
    for (const handle of script.founders.handles)
      expect(handles).toContain(handle)
  })

  it('grows the real network all the way, once', () => {
    const grows = script.cues.filter(
      (cue): cue is Extract<Cue, { kind: 'grow' }> => cue.kind === 'grow',
    )
    expect(grows[0]?.progress[0]).toBe(0)
    expect(grows.at(-1)?.progress[1]).toBe(1)
  })
})
