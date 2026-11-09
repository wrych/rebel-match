import type { Request, RequestHandler, Response } from 'express'
import type { z } from 'zod'
import type { MemberRef } from '../auth/index.js'
import type { GuardedLocals } from './require-permission.js'

type Part = 'params' | 'query' | 'body'

/** The schemas a route validates its request against, by part. */
export type Schemas = Partial<Record<Part, z.ZodType>>

/** Each validated part of a request, as its schema outputs it. */
export type Parsed<S extends Schemas> = {
  [K in keyof S]: z.output<NonNullable<S[K]>>
}

type Handler<S extends Schemas> = (
  input: Parsed<S> & { member: MemberRef },
  response: Response,
  request: Request,
) => Promise<void> | void

const parts: readonly Part[] = ['params', 'query', 'body']

/** The member `requirePermission` or `requireSession` let through. */
export function memberOf(response: Response): MemberRef {
  return (response.locals as GuardedLocals).member
}

function parse<S extends Schemas>(
  schemas: S,
  request: Request,
): Parsed<S> | null {
  const parsed: Partial<Record<Part, unknown>> = {}
  for (const part of parts) {
    const schema = schemas[part]
    if (schema === undefined) continue
    const result = schema.safeParse(request[part])
    if (!result.success) return null
    parsed[part] = result.data
  }
  return parsed as Parsed<S>
}

/** A guarded route's handler, called with its validated request parts and
 * member; a request any schema refuses is answered 400 `bad_request`.
 * Schemas that depend on live limits are given as a function, built per
 * request. */
export function handle<S extends Schemas>(
  schemas: S | (() => S),
  handler: Handler<S>,
): RequestHandler {
  return async (request, response) => {
    const input = parse(
      typeof schemas === 'function' ? schemas() : schemas,
      request,
    )
    if (input === null) {
      response.status(400).json({ error: 'bad_request' })
      return
    }
    await handler({ ...input, member: memberOf(response) }, response, request)
  }
}

/** Answers 404 `not_found`, the same for a row that is absent as for one the
 * caller may not see (R-NAV-8). */
export function notFound(response: Response): void {
  response.status(404).json({ error: 'not_found' })
}

/** Answers an outcome as `{ result }`, with the status its table gives it. */
export function replyOutcome<O extends string>(
  response: Response,
  statuses: Record<O, number>,
  outcome: O,
): void {
  response.status(statuses[outcome]).json({ result: outcome })
}

/** Answers what was found, under `key` when one is given, or 404 when
 * nothing was. */
export function replyFound(
  response: Response,
  found: object | null,
  key?: string,
): void {
  if (found === null) notFound(response)
  else response.json(key === undefined ? found : { [key]: found })
}
