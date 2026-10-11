// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { describe, expect, it } from 'vitest'
import RebelMark from './RebelMark.vue'

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

  it("paints the happy favicon in happy mode's own colours", () => {
    const theme = readFileSync('client/styles/theme.css', 'utf8')
    const happy = theme.slice(theme.indexOf(":root[data-mood='happy']"))
    const favicon = readFileSync('client/public/favicon-happy.svg', 'utf8')
    const colours = ['accent', 'card', 'door', 'token'].map(
      (token) => new RegExp(`--${token}: (#[0-9a-f]+);`).exec(happy)?.[1],
    )

    for (const colour of colours) expect(favicon).toContain(`"${colour}"`)
  })
})
