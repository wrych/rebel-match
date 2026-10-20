import createDOMPurify from 'dompurify'
import { JSDOM } from 'jsdom'

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'

// Everything that can load, run, link or embed: what is left is drawing
// (R-BADGE-5, ADR 0053).
const FORBID_TAGS = [
  'a',
  'animate',
  'animateMotion',
  'animateTransform',
  'feImage',
  'foreignObject',
  'image',
  'script',
  'set',
  'style',
  'use',
]
const FORBID_ATTR = ['style', 'href', 'xlink:href']
const DRAWING = 'path, circle, ellipse, line, polygon, polyline, rect, text'
// A paint or filter may point at a gradient in the file, never outside it.
const OUTSIDE_URL = /url\(\s*(?!['"]?#)/i

const { window } = new JSDOM('')
const purify = createDOMPurify(window)
purify.addHook('uponSanitizeAttribute', (_node, data) => {
  if (OUTSIDE_URL.test(data.attrValue)) data.keepAttr = false
})

/** What became of an uploaded logo: the cleaned SVG, or refused. */
export type LogoOutcome =
  { result: 'clean'; svg: string } | { result: 'refused' }

function parsesAsSvg(text: string): Document | null {
  const document = new window.DOMParser().parseFromString(text, 'image/svg+xml')
  const root = document.documentElement
  return root.localName === 'svg' &&
    root.namespaceURI === SVG_NAMESPACE &&
    document.getElementsByTagName('parsererror').length === 0
    ? document
    : null
}

/** Keeps only the drawing in an uploaded SVG logo, so it can be shown as a
 * picture and nothing else; refuses one over `maxBytes`, one that is not SVG,
 * and one with nothing drawable left (R-BADGE-5). */
export function cleanLogo(text: string, maxBytes: number): LogoOutcome {
  if (Buffer.byteLength(text, 'utf8') > maxBytes) return { result: 'refused' }
  if (parsesAsSvg(text) === null) return { result: 'refused' }
  const cleaned = purify.sanitize(text, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS,
    FORBID_ATTR,
  })
  const svg = cleaned.replace(
    /^<svg(?![^>]*\sxmlns=)/,
    `<svg xmlns="${SVG_NAMESPACE}"`,
  )
  const document = parsesAsSvg(svg)
  if (document === null || document.querySelector(DRAWING) === null)
    return { result: 'refused' }
  return { result: 'clean', svg }
}
