import { z } from 'zod'

/** A person the presentation may name, as the private cast file lists them
 * (R-PRES-5). */
export interface CastEntry {
  handle: string
  name: string
  photo?: string
  email?: string
  groups: string[]
}

/** A cast member as the client gets them: their position in the network
 * instead of their email (R-PRES-6). */
export interface CastMember {
  handle: string
  name: string
  photo: string | null
  groups: string[]
  node: number | null
}

const HANDLE = /^[a-z][a-zA-Z0-9-]*$/
// Photos travel inline, so the stage needs nothing from elsewhere and the
// content security policy stays as it is (ADR 0034).
const PHOTO = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/
const NAME_MAX_CHARS = 80
const PHOTO_MAX_CHARS = 3_000_000

const entry = z.object({
  handle: z.string().regex(HANDLE),
  name: z.string().trim().min(1).max(NAME_MAX_CHARS),
  photo: z.string().max(PHOTO_MAX_CHARS).regex(PHOTO).optional(),
  email: z.email().optional(),
  groups: z.array(z.string().regex(HANDLE)).default([]),
})

const castFile = z
  .array(entry)
  .refine(
    (cast) => new Set(cast.map((each) => each.handle)).size === cast.length,
    { message: 'each handle may appear once' },
  )

/** Reads a cast file. A problem is named by where it is, never by what the
 * file holds, since it holds names and addresses (R-NFR-1). */
export function parseCast(text: string): CastEntry[] {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error('presentation cast: the file is not JSON')
  }
  const parsed = castFile.safeParse(json)
  if (!parsed.success) {
    const where = parsed.error.issues
      .map((issue) => issue.path.join('.') || 'the list')
      .join(', ')
    throw new Error(`presentation cast: check ${where}`)
  }
  return parsed.data.map(({ email, photo, ...rest }) => ({
    ...rest,
    ...(email === undefined ? {} : { email: email.toLowerCase() }),
    ...(photo === undefined ? {} : { photo }),
  }))
}

/** The cast as the stage gets it: each member's node from their email, or
 * none when they are not an active member or have no email (R-PRES-6). */
export function castOnStage(
  cast: readonly CastEntry[],
  nodeOf: (email: string) => number | null,
): CastMember[] {
  return cast.map((entry) => ({
    handle: entry.handle,
    name: entry.name,
    photo: entry.photo ?? null,
    groups: entry.groups,
    node: entry.email === undefined ? null : nodeOf(entry.email),
  }))
}
