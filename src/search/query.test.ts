import { describe, expect, it } from 'vitest'
import {
  ACCENTS,
  fold,
  isSearchable,
  parseQuery,
  printQuery,
  tokenize,
  type ParsedQuery,
} from './query.js'

const none: ParsedQuery = {
  name: [],
  company: [],
  title: [],
  sector: [],
  free: [],
}

describe('parseQuery (R-FIND-2)', () => {
  it('reads plain words as name words', () => {
    expect(parseQuery('Andy  moesch')).toEqual({
      ...none,
      free: ['andy', 'moesch'],
    })
  })

  it('reads each operator into its field, org: as company:', () => {
    expect(
      parseQuery('name:and* company:acme org:Rebels title:CTO sector:health'),
    ).toEqual({
      name: ['and'],
      company: ['acme', 'rebels'],
      title: ['cto'],
      sector: ['health'],
      free: [],
    })
  })

  it('takes operators in any case', () => {
    expect(parseQuery('Company:Acme NAME:ana')).toMatchObject({
      company: ['acme'],
      name: ['ana'],
    })
  })

  it('keeps a quoted phrase as one term', () => {
    expect(parseQuery('company:"Corporate Rebels" "head of"')).toMatchObject({
      company: ['corporate rebels'],
      free: ['head of'],
    })
  })

  it('runs an unclosed quote to the end', () => {
    expect(parseQuery('title:"head of people')).toMatchObject({
      title: ['head of people'],
    })
  })

  it('ignores case and accents, and drops a trailing star', () => {
    expect(parseQuery('Zoë ÉMILE* name:**')).toEqual({
      ...none,
      free: ['zoe', 'emile'],
    })
  })

  it('reads an unknown operator as a plain word', () => {
    expect(parseQuery('foo:bar')).toEqual({ ...none, free: ['foo:bar'] })
  })

  it('leaves out an operator with nothing after it yet', () => {
    expect(parseQuery('ana company:')).toEqual({ ...none, free: ['ana'] })
  })

  it('reads an empty query as nothing', () => {
    expect(parseQuery('   ')).toEqual(none)
  })
})

describe('tokenize and printQuery (R-FIND-4)', () => {
  it('writes back what it read, so box and chips agree', () => {
    const query = 'ana name:and* company:"Corporate Rebels" sector:health'

    expect(printQuery(tokenize(query))).toBe(query)
  })

  it('lets a chip be removed by printing the rest', () => {
    const tokens = tokenize('ana company:acme title:cto')

    expect(printQuery(tokens.filter((t) => t.field !== 'company'))).toBe(
      'ana title:cto',
    )
  })

  it('writes back a part it could not read as typed, quotes included', () => {
    const tokens = tokenize('ana foo:"x y" company:acme')

    expect(printQuery(tokens.filter((t) => t.field !== 'company'))).toBe(
      'ana foo:"x y"',
    )
  })

  it('closes an unclosed quote, so a part added after it stays its own', () => {
    const tokens = [
      ...tokenize('title:"head of'),
      { field: 'company', value: 'acme', quoted: false } as const,
    ]
    const printed = printQuery(tokens)

    expect(printed).toBe('title:"head of" company:acme')
    expect(parseQuery(printed)).toMatchObject({
      title: ['head of'],
      company: ['acme'],
    })
  })

  it('quotes a value holding a space', () => {
    expect(
      printQuery([{ field: 'title', value: 'head of', quoted: false }]),
    ).toBe('title:"head of"')
  })

  it('keeps the value as typed, case and accents included', () => {
    expect(tokenize('company:Zürich')).toEqual([
      {
        field: 'company',
        value: 'Zürich',
        quoted: false,
        raw: 'company:Zürich',
      },
    ])
  })
})

describe('isSearchable (R-FIND-2)', () => {
  it('needs one term of the minimum length, in any field', () => {
    expect(isSearchable(parseQuery('a b'), 2)).toBe(false)
    expect(isSearchable(parseQuery('a company:ac'), 2)).toBe(true)
    expect(isSearchable(parseQuery('sector:health'), 2)).toBe(true)
  })

  it('needs no name', () => {
    expect(isSearchable(parseQuery('company:acme'), 2)).toBe(true)
  })

  it('finds nothing to search in an empty query', () => {
    expect(isSearchable(none, 1)).toBe(false)
  })
})

describe('fold', () => {
  it('trims white space around the star', () => {
    expect(fold(' Ana * ')).toBe('ana')
  })

  it('drops accents and keeps marks that are letters of their script', () => {
    expect(fold('Zoë Ćosić')).toBe('zoe cosic')
    expect(fold('राम')).toBe('राम'.normalize('NFD'))
  })
})

describe('ACCENTS', () => {
  it('names the combining diacritical marks as Postgres reads them', () => {
    expect(ACCENTS).toBe(
      '[\\u0300-\\u036f\\u1ab0-\\u1aff\\u1dc0-\\u1dff\\u20d0-\\u20ff\\ufe20-\\ufe2f]',
    )
  })
})
