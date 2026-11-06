// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import KindChip from './KindChip.vue'

describe('KindChip (R-CONN-10)', () => {
  it.each([
    ['same_boat', false, 'Same boat'],
    ['been_there', false, 'Been there'],
    ['direct', false, 'Direct'],
    ['direct', true, 'Connected directly'],
  ] as const)('names %s (connected: %s) as %s', (kind, connected, text) => {
    expect(mount(KindChip, { props: { kind, connected } }).text()).toBe(text)
  })
})
