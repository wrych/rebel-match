/** The fields a query can narrow by, as their operators name them. */
export const searchFields = ['name', 'company', 'title', 'sector'] as const

export type SearchField = (typeof searchFields)[number]

/** One part of a query: its operator, if any, and its value without quotes;
 * `raw` is the part exactly as typed, absent for one a chip added. */
export interface QueryToken {
  field: SearchField | null
  value: string
  quoted: boolean
  raw?: string
}

/** A query ready to search: each value folded to lower case without accents
 * and its trailing `*` dropped; `free` holds plain words, matched against
 * the name (R-FIND-2). */
export type ParsedQuery = Record<SearchField | 'free', string[]>

const operators: Readonly<Record<string, SearchField>> = {
  name: 'name',
  company: 'company',
  org: 'company',
  title: 'title',
  sector: 'sector',
}

const OPERATOR = /^([a-z]+):(.*)$/is
const SPACE = /\s/
const QUOTE = '"'

function splitOutsideQuotes(query: string): string[] {
  const parts: string[] = []
  let current = ''
  let quoted = false
  for (const char of query) {
    if (char === QUOTE) quoted = !quoted
    if (SPACE.test(char) && !quoted) {
      if (current !== '') parts.push(current)
      current = ''
    } else current += char
  }
  if (current !== '') parts.push(current)
  return parts
}

// An unclosed quote is closed, so a part printed after it stays its own.
function closed(segment: string): string {
  const quotes = segment.split(QUOTE).length - 1
  return quotes % 2 === 0 ? segment : `${segment}${QUOTE}`
}

function tokenOf(segment: string): QueryToken {
  const match = OPERATOR.exec(segment)
  const field =
    match === null ? undefined : operators[(match[1] ?? '').toLowerCase()]
  const rest = field === undefined ? segment : (match?.[2] ?? '')
  return {
    field: field ?? null,
    value: rest.replaceAll(QUOTE, ''),
    quoted: rest.includes(QUOTE),
    raw: closed(segment),
  }
}

/** The query as typed, part by part, so chips can show and remove each one
 * (R-FIND-4). An unknown operator is a plain word. */
export function tokenize(query: string): QueryToken[] {
  return splitOutsideQuotes(query).map(tokenOf)
}

/** One part written back: as it was typed, or as one would type it. */
export function printToken(token: QueryToken): string {
  if (token.raw !== undefined) return token.raw
  const prefix = token.field === null ? '' : `${token.field}:`
  const needsQuotes = token.quoted || SPACE.test(token.value)
  return needsQuotes
    ? `${prefix}${QUOTE}${token.value}${QUOTE}`
    : `${prefix}${token.value}`
}

/** The parts written back as one query, so box and chips always agree. */
export function printQuery(tokens: readonly QueryToken[]): string {
  return tokens.map(printToken).join(' ')
}

const ACCENT_RANGES: readonly (readonly [number, number])[] = [
  [0x0300, 0x036f],
  [0x1ab0, 0x1aff],
  [0x1dc0, 0x1dff],
  [0x20d0, 0x20ff],
  [0xfe20, 0xfe2f],
]

const escaped = (point: number): string =>
  `\\u${point.toString(16).padStart(4, '0')}`

/** The accents folding drops, the combining diacritical marks, as a
 * character class Postgres reads, so a term and the text searched are
 * folded the same (R-FIND-2). */
export const ACCENTS = `[${ACCENT_RANGES.map(
  ([from, to]) => `${escaped(from)}-${escaped(to)}`,
).join('')}]`

function isAccent(char: string): boolean {
  const point = char.codePointAt(0) ?? 0
  return ACCENT_RANGES.some(([from, to]) => point >= from && point <= to)
}

/** Lower case, accents dropped, trailing `*` dropped (R-FIND-2). */
export function fold(value: string): string {
  return value
    .normalize('NFD')
    .split('')
    .filter((char) => !isAccent(char))
    .join('')
    .toLowerCase()
    .trim()
    .replace(/\*+$/, '')
    .trim()
}

/** The query ready to search; empty values are left out. */
export function parseQuery(query: string): ParsedQuery {
  const parsed: ParsedQuery = {
    name: [],
    company: [],
    title: [],
    sector: [],
    free: [],
  }
  for (const token of tokenize(query)) {
    const value = fold(token.value)
    if (value !== '') parsed[token.field ?? 'free'].push(value)
  }
  return parsed
}

/** Whether any term is long enough to search on (R-FIND-2). */
export function isSearchable(parsed: ParsedQuery, minChars: number): boolean {
  return Object.values(parsed).some((values) =>
    values.some((value) => value.length >= minChars),
  )
}
