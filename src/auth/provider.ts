import { randomUUID } from 'node:crypto'
import type { Config } from '../config.js'
import { resolvePermissions } from '../permissions.js'
import { safeNextPath } from '../routes.js'
import {
  readCookie,
  sessionCookie,
  SESSION_COOKIE_NAME,
  signSessionId,
  unsignSessionId,
} from './cookie.js'
import type { AuthStore } from './store.js'
import { hashSecret, judgeToken, linkLifetimeMs, newSecret } from './tokens.js'
import type {
  AuthProvider,
  CallerRequest,
  LinkDelivery,
  LinkKind,
  MemberRef,
  SessionCookie,
  VerifyResult,
} from './types.js'

const MS_PER_DAY = 86_400_000

export interface AuthDeps {
  store: AuthStore
  deliver: LinkDelivery
  config: Pick<
    Config,
    'publicUrl' | 'sessionSecret' | 'sessionTtlDays' | 'limits'
  >
  now?: () => Date
}

interface Context extends AuthDeps {
  now: () => Date
  secure: boolean
}

function verifyUrl(publicUrl: string, rawToken: string): string {
  const url = new URL('/auth/verify', publicUrl)
  url.searchParams.set('token', rawToken)
  return url.toString()
}

async function issueLink(
  ctx: Context,
  email: string,
  opts: { kind: LinkKind; next?: string | undefined },
): Promise<void> {
  const memberId = await ctx.store.memberIdByEmail(email)
  if (memberId === null) throw new Error('issueLink: no member for address')

  const raw = newSecret()
  const lifetime = linkLifetimeMs(opts.kind, ctx.config.limits)
  await ctx.store.insertToken({
    id: randomUUID(),
    memberId,
    tokenHash: hashSecret(raw),
    kind: opts.kind,
    nextPath: safeNextPath(opts.next),
    expiresAt: new Date(ctx.now().getTime() + lifetime),
    usedAt: null,
  })

  const url = verifyUrl(ctx.config.publicUrl, raw)
  await ctx.deliver({ memberId, email, kind: opts.kind, url })
}

async function verifyToken(ctx: Context, raw: string): Promise<VerifyResult> {
  const now = ctx.now()
  const token = await ctx.store.findToken(hashSecret(raw))
  if (token === null) return { ok: false, reason: 'unknown' }

  const verdict = judgeToken(token, now)
  if (verdict !== 'valid') return { ok: false, reason: verdict }
  if (!(await ctx.store.markTokenUsed(token.id, now))) {
    return { ok: false, reason: 'used' }
  }

  return { ok: true, memberId: token.memberId, next: token.nextPath }
}

async function createSession(
  ctx: Context,
  memberId: string,
): Promise<SessionCookie> {
  const raw = newSecret()
  const lifetime = ctx.config.sessionTtlDays * MS_PER_DAY
  await ctx.store.insertSession({
    idHash: hashSecret(raw),
    memberId,
    expiresAt: new Date(ctx.now().getTime() + lifetime),
  })

  const value = signSessionId(raw, ctx.config.sessionSecret)
  return sessionCookie(value, lifetime, ctx.secure)
}

function presentedSessionHash(
  ctx: Context,
  request: CallerRequest,
): string | null {
  const value = readCookie(request.headers.cookie, SESSION_COOKIE_NAME)
  const raw =
    value === null ? null : unsignSessionId(value, ctx.config.sessionSecret)

  return raw === null ? null : hashSecret(raw)
}

async function currentMember(
  ctx: Context,
  request: CallerRequest,
): Promise<MemberRef | null> {
  const idHash = presentedSessionHash(ctx, request)
  const session = idHash === null ? null : await ctx.store.findSession(idHash)
  if (session === null) return null
  if (session.expiresAt.getTime() <= ctx.now().getTime()) return null

  const roles = await ctx.store.activeMemberRoles(session.memberId)
  if (roles === null) return null

  return { id: session.memberId, roles, permissions: resolvePermissions(roles) }
}

async function endSession(
  ctx: Context,
  request: CallerRequest,
): Promise<SessionCookie> {
  const idHash = presentedSessionHash(ctx, request)
  if (idHash !== null) await ctx.store.deleteSession(idHash)

  return sessionCookie('', 0, ctx.secure)
}

/** The in-app auth provider (ADR 0015): magic links, hashed at rest, and a
 * signed session cookie backed by a server-side store. */
export function createAuth(deps: AuthDeps): AuthProvider {
  const ctx: Context = {
    ...deps,
    now: deps.now ?? (() => new Date()),
    secure: deps.config.publicUrl.startsWith('https:'),
  }

  return {
    issueLink: (email, opts) => issueLink(ctx, email, opts),
    verifyToken: (raw) => verifyToken(ctx, raw),
    createSession: (memberId) => createSession(ctx, memberId),
    currentMember: (request) => currentMember(ctx, request),
    endSession: (request) => endSession(ctx, request),
  }
}
