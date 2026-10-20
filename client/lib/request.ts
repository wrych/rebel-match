type Method = 'POST' | 'PUT' | 'PATCH' | 'DELETE'

const JSON_HEADERS = { 'content-type': 'application/json' }

/** Sends a request: a bare GET without a method, `json` as the body when
 * given. */
export function send(
  path: string,
  method?: Method,
  json?: unknown,
): Promise<Response> {
  if (method === undefined) return fetch(path)
  if (json === undefined) return fetch(path, { method })
  return fetch(path, {
    method,
    headers: JSON_HEADERS,
    body: JSON.stringify(json),
  })
}

/** The error for an answer the caller cannot act on: what failed and the
 * status, never the body, so no PII reaches a log (constitution §5). */
export function failure(what: string, response: Response): Error {
  return new Error(`${what} (${String(response.status)})`)
}

/** Throws `failure(what)` unless the answer is ok. */
export function ensureOk(response: Response, what: string): void {
  if (!response.ok) throw failure(what, response)
}

/** The JSON of an ok answer; throws `failure(what)` for any other. */
export async function jsonOf<T>(response: Response, what: string): Promise<T> {
  ensureOk(response, what)
  return (await response.json()) as T
}

/** Reads `path` as JSON; throws `failure(what)` unless it is ok. */
export async function getJson<T>(path: string, what: string): Promise<T> {
  return jsonOf<T>(await send(path), what)
}

/** Reads `path` as JSON, null when it is not found (R-NAV-8); throws
 * `failure(what)` for anything else not ok. */
export async function findJson<T>(
  path: string,
  what: string,
): Promise<T | null> {
  const response = await send(path)
  if (response.status === 404) return null
  return jsonOf<T>(response, what)
}

/** What a status means, with `ok` for any other ok status. */
export type Outcomes<T> = Partial<Record<number, T>> & { ok?: T }

/** The outcome its status names, else `ok`'s for an ok answer; throws
 * `failure(what)` for any status it does not name. */
export function outcomeOf<T>(
  response: Response,
  what: string,
  outcomes: Outcomes<T>,
): T {
  const outcome =
    outcomes[response.status] ?? (response.ok ? outcomes.ok : undefined)
  if (outcome === undefined) throw failure(what, response)
  return outcome
}
