// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import CellFlag from './CellFlag.vue'

describe('CellFlag', () => {
  it('shows the flag and names the cell on hover and to assistive technology (R-PROF-9)', () => {
    const flag = mount(CellFlag, { props: { cell: 'berlin' } })

    expect(flag.text()).toBe('🐻')
    expect(flag.attributes('title')).toBe('Rebel cell: Berlin')
    expect(flag.attributes('aria-label')).toBe('Rebel cell: Berlin')
  })

  it.each([null, 'zurich'])('shows nothing for %s', (cell) => {
    expect(mount(CellFlag, { props: { cell } }).html()).toBe('<!--v-if-->')
  })
})
