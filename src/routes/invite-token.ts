import { z } from 'zod'

// The width of invites.token (src/db/schema.ts).
const INVITE_TOKEN_MAX = 64

/** An invite token as a request body carries it. */
export const inviteToken = z.string().min(1).max(INVITE_TOKEN_MAX)
