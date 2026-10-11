// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { describe, expect, it } from 'vitest'
import RebelMark from './RebelMark.vue'
import { MARK_HAPPY_BANDS } from '../lib/mark'

describe('RebelMark (R-LOOK-5)', () => {
  it.each(['favicon.svg', 'favicon-happy.svg'])(
    'is drawn with the same R as %s',
    (file) => {
      const favicon = readFileSync(`client/public/${file}`, 'utf8')
      const r = mount(RebelMark).find('path').attributes('d')

      expect(r).toBeTruthy()
      expect(favicon).toContain(`d="${String(r)}"`)
    },
  )

  it('draws the wink only while it plays', () => {
    expect(mount(RebelMark).find('.rebel-mark-lid').exists()).toBe(false)
    expect(
      mount(RebelMark, { props: { play: true } }).findAll('.rebel-mark-lid'),
    ).toHaveLength(2)
  })

  it('gives each playing mark on a page its own masks', () => {
    const page = defineComponent({
      components: { RebelMark },
      template: '<RebelMark play /><RebelMark play />',
    })
    const ids = mount(page)
      .findAll('mask')
      .map((mask) => mask.attributes('id'))

    expect(ids).toHaveLength(8)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps happy mode, its favicon and the game on one set of bands', () => {
    const theme = readFileSync('client/styles/theme.css', 'utf8')
    const happy = theme.slice(theme.indexOf(":root[data-mood='happy']"))
    const value = (token: string): string | undefined => {
      const raw = new RegExp(`${token}: ([^;]+);`).exec(happy)?.[1]
      const named =
        raw === undefined ? undefined : /^var\((--[\w-]+)\)$/.exec(raw)
      return named?.[1] === undefined ? raw : value(named[1])
    }
    const favicon = readFileSync('client/public/favicon-happy.svg', 'utf8')

    MARK_HAPPY_BANDS.forEach((colour, index) => {
      expect(value(`--mark-band-${String(index + 1)}`)).toBe(colour)
      expect(favicon).toContain(`"${colour}"`)
    })
  })
})
