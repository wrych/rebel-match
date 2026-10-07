// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { parse } from '@vue/compiler-sfc'
import { afterEach, describe, expect, it } from 'vitest'

function stylesOf(sfcPath: string): string {
  const { descriptor } = parse(readFileSync(sfcPath, 'utf8'))
  return descriptor.styles
    .map((style) => style.content.replace(/@import[^;]+;/g, ''))
    .join('\n')
}

function render(sfcPath: string, html: string): void {
  const sheet = document.createElement('style')
  sheet.textContent =
    readFileSync('client/styles/theme.css', 'utf8') + stylesOf(sfcPath)
  document.head.append(sheet)
  document.body.innerHTML = html
}

function styleOf(selector: string): CSSStyleDeclaration {
  const element = document.querySelector(selector)
  if (element === null) throw new Error(`nothing matches ${selector}`)
  return getComputedStyle(element)
}

afterEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})

describe('the header while the page scrolls (R-NAV-11)', () => {
  it('stays at the top, with the way home and the menu', () => {
    render('client/App.vue', '<header class="bar"></header>')

    expect(styleOf('.bar').position).toBe('sticky')
    expect(styleOf('.bar').top).toBe('0px')
  })

  it('leaves room above the members action bar, which also sticks', () => {
    render('client/screens/MembersScreen.vue', '<div class="action-bar"></div>')

    expect(styleOf('.action-bar').position).toBe('sticky')
    expect(styleOf('.action-bar').top).toContain('var(--header-height)')
  })
})
