import { describe, expect, it } from 'vitest'
import { cleanLogo } from './logo.js'

const MAX = 32_768
const svg = (body: string, attributes = ''): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"${attributes}>${body}</svg>`
const star =
  '<path d="M12 2l3 7h7l-6 4 2 7-6-4-6 4 2-7-6-4h7z" fill="#d4471f"/>'

function cleaned(text: string): string {
  const outcome = cleanLogo(text, MAX)
  if (outcome.result !== 'clean') throw new Error('refused')
  return outcome.svg
}

describe('cleanLogo (R-BADGE-5)', () => {
  it('keeps the drawing: shapes, text, fills and gradients in the file', () => {
    const logo = cleaned(
      svg(
        `<defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs>` +
          `${star}<circle cx="12" cy="12" r="3" fill="url(#g)"/><text x="2" y="22">SUMMIT</text>`,
      ),
    )

    expect(logo).toContain('<path d="M12 2l3 7')
    expect(logo).toContain('fill="url(#g)"')
    expect(logo).toContain('linearGradient')
    expect(logo).toContain('SUMMIT')
    expect(logo).toContain('viewBox="0 0 24 24"')
    expect(logo.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(
      true,
    )
  })

  it('drops scripts and event handlers', () => {
    const logo = cleaned(
      svg(`<script>alert(1)</script>${star}`, ' onload="alert(1)"'),
    )

    expect(logo).not.toMatch(/script|onload|alert/i)
  })

  it('drops what loads, links or embeds anything', () => {
    const logo = cleaned(
      svg(
        '<style>@import url(https://evil.example/x.css)</style>' +
          '<image href="https://evil.example/x.png"/>' +
          '<a href="https://evil.example"><path d="M1 1h2"/></a>' +
          '<foreignObject><div>hi</div></foreignObject>' +
          '<use href="#x"/>' +
          `<path d="M0 0h4" style="fill:red" fill="url(https://evil.example/p)"/>${star}`,
      ),
    )

    expect(logo).not.toMatch(
      /evil|<style|<image|<a\b|foreignObject|<use|style=|href/i,
    )
  })

  it('refuses what is not SVG, or is too big, or has nothing drawable left', () => {
    expect(cleanLogo('<html><body>hi</body></html>', MAX).result).toBe(
      'refused',
    )
    expect(cleanLogo('not even markup', MAX).result).toBe('refused')
    expect(
      cleanLogo('<svg xmlns="http://www.w3.org/2000/svg"><path', MAX).result,
    ).toBe('refused')
    expect(cleanLogo(svg(star), 20).result).toBe('refused')
    expect(cleanLogo(svg('<script>alert(1)</script>'), MAX).result).toBe(
      'refused',
    )
  })
})
