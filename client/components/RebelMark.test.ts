// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import RebelMark from './RebelMark.vue'

describe('RebelMark (R-LOOK-5)', () => {
  it('is drawn with the same R as the favicon', () => {
    const favicon = readFileSync('client/public/favicon.svg', 'utf8')
    const r = mount(RebelMark).find('path').attributes('d')

    expect(r).toBeTruthy()
    expect(favicon).toContain(`d="${String(r)}"`)
  })
})
