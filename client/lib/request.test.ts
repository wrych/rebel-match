import { afterEach, describe, expect, it, vi } from 'vitest'
import { findJson, getJson, outcomeOf, send } from './request'

function answer(status: number, body: unknown = {}): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const response = (status: number): Response =>
  ({ ok: status >= 200 && status < 300, status }) as Response

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('send', () => {
  it('reads with a bare GET', async () => {
    const fetchMock = answer(200)

    await send('/api/thing')

    expect(fetchMock).toHaveBeenCalledWith('/api/thing')
  })

  it('sends a method without a body', async () => {
    const fetchMock = answer(204)

    await send('/api/thing', 'DELETE')

    expect(fetchMock).toHaveBeenCalledWith('/api/thing', { method: 'DELETE' })
  })

  it('sends JSON with its content type', async () => {
    const fetchMock = answer(204)

    await send('/api/thing', 'PUT', { value: 3 })

    expect(fetchMock).toHaveBeenCalledWith('/api/thing', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 3 }),
    })
  })
})

describe('getJson', () => {
  it('gives the body of an ok answer', async () => {
    answer(200, { things: [1] })

    expect(await getJson('/api/thing', 'things unavailable')).toEqual({
      things: [1],
    })
  })

  it('throws naming what failed and the status, never the body', async () => {
    answer(500, { email: 'someone@example.invalid' })

    await expect(getJson('/api/thing', 'things unavailable')).rejects.toThrow(
      /^things unavailable \(500\)$/,
    )
  })
})

describe('findJson', () => {
  it('reads a missing row as null (R-NAV-8)', async () => {
    answer(404)

    expect(await findJson('/api/thing/1', 'thing unavailable')).toBeNull()
  })

  it('throws for anything else not ok', async () => {
    answer(503)

    await expect(findJson('/api/thing/1', 'thing unavailable')).rejects.toThrow(
      '503',
    )
  })
})

describe('outcomeOf', () => {
  it('names the outcome its status maps to, before ok', () => {
    expect(outcomeOf(response(204), 'x', { 204: 'done', ok: 'other' })).toBe(
      'done',
    )
  })

  it('falls back to ok for any other ok status', () => {
    expect(outcomeOf(response(200), 'x', { 409: 'stale', ok: 'done' })).toBe(
      'done',
    )
  })

  it('throws for a status it does not name, even an ok one without ok', () => {
    expect(() =>
      outcomeOf(response(200), 'not saved', { 204: 'done' }),
    ).toThrow('not saved (200)')
    expect(() =>
      outcomeOf(response(500), 'not saved', { 404: 'gone', ok: 'done' }),
    ).toThrow('not saved (500)')
  })
})
