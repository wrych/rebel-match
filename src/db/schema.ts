/**
 * The schema, declared once (ADR 0024). Queries are typed against it and the
 * SQL migrations in `db/migrations` are generated from it by drizzle-kit.
 * Comments on a table say why it is shaped the way it is; design.md §2 has
 * the rest.
 */

import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  char,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
  type AnyPgColumn,
  type PgCharBuilderInitial,
  type PgTimestampBuilderInitial,
  type PgVarcharBuilderInitial,
} from 'drizzle-orm/pg-core'

type Enum = [string, ...string[]]

/** Member, challenge, request and token ids: UUID text. */
const id = (name: string): PgVarcharBuilderInitial<string, Enum, 36> =>
  varchar(name, { length: 36 })
/** A moment in UTC. */
const at = (name: string): PgTimestampBuilderInitial<string> =>
  timestamp(name, { withTimezone: true, mode: 'date' })
/** A trend's two-digit id, '01' to '08'. */
const trendRef = (name: string): PgCharBuilderInitial<string, Enum, 2> =>
  char(name, { length: 2 })

// The lists a member picks sector and company size from (R-ONB-2). The
// code in src/profile-options.ts is the source; seeds copy it here, so the
// database refuses a value off the list and cards read the label by key.
export const sectors = pgTable('sectors', {
  key: varchar('key', { length: 40 }).primaryKey(),
  label: varchar('label', { length: 80 }).notNull(),
})

export const companySizes = pgTable('company_sizes', {
  key: varchar('key', { length: 20 }).primaryKey(),
  label: varchar('label', { length: 40 }).notNull(),
})

export const memberStatus = pgEnum('member_status', [
  'applicant',
  'active',
  'rejected',
  'deleted',
])

// Members, applicants and the whitelist are one table. Onboarding is complete
// only when both `name` and `consent_at` are set (R-ONB-1); `requested_name`
// is what an applicant typed at the door and never satisfies that gate
// (R-AUTH-12). The analytics opt-in is separate and optional: both
// `analytics_consent_*` set means opted in (R-ANA-4, ADR 0026).
export const members = pgTable(
  'members',
  {
    id: id('id').primaryKey(),
    email: varchar('email', { length: 320 }).notNull(),
    name: varchar('name', { length: 120 }),
    jobTitle: varchar('job_title', { length: 120 }),
    org: varchar('org', { length: 160 }),
    sector: varchar('sector', { length: 40 }).references(() => sectors.key, {
      onDelete: 'set null',
    }),
    companySize: varchar('company_size', { length: 20 }).references(
      () => companySizes.key,
      { onDelete: 'set null' },
    ),
    status: memberStatus('status').notNull().default('applicant'),
    // A deleted account waits here until the sweep erases it, with what it
    // was for an undo, and whether the member deleted it (ADR 0032).
    eraseAfter: at('erase_after'),
    statusBeforeDeletion: memberStatus('status_before_deletion'),
    deletedBySelf: boolean('deleted_by_self'),
    requestedName: varchar('requested_name', { length: 120 }),
    requestedOrg: varchar('requested_org', { length: 160 }),
    joinedViaInviteId: id('joined_via_invite_id').references(
      (): AnyPgColumn => invites.id,
      { onDelete: 'set null' },
    ),
    consentVersion: varchar('consent_version', { length: 20 }),
    consentAt: at('consent_at'),
    analyticsConsentVersion: varchar('analytics_consent_version', {
      length: 20,
    }),
    analyticsConsentAt: at('analytics_consent_at'),
    analyticsId: id('analytics_id').notNull(),
    createdAt: at('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_members_email').on(t.email),
    uniqueIndex('uq_members_analytics_id').on(t.analyticsId),
    index('ix_members_status').on(t.status),
  ],
)

// Access is role-based, never an is_admin flag (ADR 0006). A member may hold
// several roles; effective permissions are the union, resolved from config.
export const roles = pgTable('roles', {
  roleKey: varchar('role_key', { length: 40 }).primaryKey(),
  label: varchar('label', { length: 80 }).notNull(),
  description: varchar('description', { length: 255 }),
})

export const memberRoles = pgTable(
  'member_roles',
  {
    memberId: id('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    roleKey: varchar('role_key', { length: 40 })
      .notNull()
      .references(() => roles.roleKey),
    grantedAt: at('granted_at').notNull().defaultNow(),
    grantedBy: id('granted_by').references(() => members.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [primaryKey({ columns: [t.memberId, t.roleKey] })],
)

export const tokenKind = pgEnum('token_kind', [
  'self_service',
  'approval',
  'restore',
])

// Only the hash is stored; the raw token exists in the email and nowhere else
// (R-NFR-5). `kind` drives the lifetime (R-AUTH-10).
export const magicTokens = pgTable(
  'magic_tokens',
  {
    id: id('id').primaryKey(),
    memberId: id('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    tokenHash: char('token_hash', { length: 64 }).notNull(),
    kind: tokenKind('kind').notNull().default('self_service'),
    nextPath: varchar('next_path', { length: 512 }),
    expiresAt: at('expires_at').notNull(),
    usedAt: at('used_at'),
    createdAt: at('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_magic_tokens_hash').on(t.tokenHash),
    index('ix_magic_tokens_member').on(t.memberId),
  ],
)

// Invite tokens are printed on posters, so they are public capabilities rather
// than secrets and are stored in clear (ADR 0014). Their protection is the
// window, the cap and revocation.
export const invites = pgTable(
  'invites',
  {
    id: id('id').primaryKey(),
    token: varchar('token', { length: 64 }).notNull(),
    label: varchar('label', { length: 120 }).notNull(),
    validFrom: at('valid_from').notNull(),
    validUntil: at('valid_until').notNull(),
    maxUses: bigint('max_uses', { mode: 'number' }).notNull(),
    uses: bigint('uses', { mode: 'number' }).notNull().default(0),
    revokedAt: at('revoked_at'),
    createdBy: id('created_by')
      .notNull()
      .references((): AnyPgColumn => members.id),
    createdAt: at('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('uq_invites_token').on(t.token)],
)

export const outboxKind = pgEnum('outbox_kind', [
  'magic_link',
  'approval',
  'connection_request',
  'admin_notice',
  'connection_accepted',
])

export const outboxStatus = pgEnum('outbox_status', [
  'recorded',
  'sent',
  'suppressed',
  'failed',
])

// Every outbound message, in every environment (ADR 0016). Outside development
// the stored body has its magic-link token redacted, so this table can never
// be used to sign in as someone else (R-MSG-4).
export const outbox = pgTable(
  'outbox',
  {
    id: id('id').primaryKey(),
    memberId: id('member_id').references(() => members.id, {
      onDelete: 'cascade',
    }),
    // A member the body quotes, so erasing them erases it too (R-MSG-6).
    aboutMemberId: id('about_member_id').references(() => members.id, {
      onDelete: 'cascade',
    }),
    toEmail: varchar('to_email', { length: 320 }).notNull(),
    kind: outboxKind('kind').notNull(),
    subject: varchar('subject', { length: 255 }).notNull(),
    bodyText: text('body_text').notNull(),
    bodyHtml: text('body_html'),
    status: outboxStatus('status').notNull().default('recorded'),
    error: varchar('error', { length: 500 }),
    createdAt: at('created_at').notNull().defaultNow(),
    sentAt: at('sent_at'),
  },
  (t) => [
    index('ix_outbox_created').on(t.createdAt),
    index('ix_outbox_to').on(t.toEmail),
    index('ix_outbox_status').on(t.status),
  ],
)

// The auth seam's server-side session store (design §8, ADR 0018). `expires`
// is in epoch seconds.
export const sessions = pgTable(
  'sessions',
  {
    sessionId: varchar('session_id', { length: 128 }).primaryKey(),
    expires: bigint('expires', { mode: 'number' }).notNull(),
    data: text('data'),
  },
  (t) => [index('ix_sessions_expires').on(t.expires)],
)

// Trends and cases are shared seed content; a member's challenges, expertise
// and follows go with them when the member is deleted (R-NFR-7).
export const trends = pgTable('trends', {
  id: trendRef('id').primaryKey(),
  short: varchar('short', { length: 80 }).notNull(),
  fromLabel: varchar('from_label', { length: 80 }).notNull(),
  peers: integer('peers').notNull().default(0),
  keywords: jsonb('keywords').notNull(),
})

export const cases = pgTable(
  'cases',
  {
    id: bigint('id', { mode: 'number' })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    trendId: trendRef('trend_id')
      .notNull()
      .references(() => trends.id),
    org: varchar('org', { length: 120 }).notNull(),
    url: varchar('url', { length: 400 }).notNull(),
    takeaway: varchar('takeaway', { length: 400 }).notNull(),
  },
  (t) => [uniqueIndex('uq_case_trend_url').on(t.trendId, t.url)],
)

export const challengeStatus = pgEnum('challenge_status', [
  'draft',
  'active',
  'archived',
])

export const challenges = pgTable(
  'challenges',
  {
    id: id('id').primaryKey(),
    memberId: id('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    trendId: trendRef('trend_id').references(() => trends.id),
    autoTrend: trendRef('auto_trend').references(() => trends.id),
    overridden: boolean('overridden').notNull().default(false),
    status: challengeStatus('status').notNull().default('active'),
    createdAt: at('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('ix_challenge_member').on(t.memberId),
    index('ix_challenge_trend').on(t.trendId),
  ],
)

export const memberExpertise = pgTable(
  'member_expertise',
  {
    memberId: id('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    trendId: trendRef('trend_id')
      .notNull()
      .references(() => trends.id),
    note: varchar('note', { length: 400 }),
  },
  (t) => [
    primaryKey({ columns: [t.memberId, t.trendId] }),
    index('ix_expertise_trend').on(t.trendId),
  ],
)

export const follows = pgTable(
  'follows',
  {
    memberId: id('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    trendId: trendRef('trend_id')
      .notNull()
      .references(() => trends.id),
    createdAt: at('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.memberId, t.trendId] })],
)

export const swipeAction = pgEnum('swipe_action', [
  'same_boat',
  'been_there',
  'follow',
  'skip',
])

// What a member did with each card, so a swiped challenge never comes back
// (R-OFF-2). It goes with either side when deleted (R-NFR-7).
export const swipes = pgTable(
  'swipes',
  {
    memberId: id('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    challengeId: id('challenge_id')
      .notNull()
      .references(() => challenges.id, { onDelete: 'cascade' }),
    action: swipeAction('action').notNull(),
    createdAt: at('created_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.memberId, t.challengeId, t.action] }),
    index('ix_swipe_challenge').on(t.challengeId),
  ],
)

// What a member was shown: one row each time a card becomes the visible one
// in their swipe deck (R-STAT-1, ADR 0033). No endpoint reads it back
// (R-STAT-2). It goes with the member or the challenge (R-STAT-3), and the
// member can clear it apart from their account (R-STAT-4).
export const deckViews = pgTable(
  'deck_views',
  {
    id: id('id').primaryKey(),
    memberId: id('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    challengeId: id('challenge_id')
      .notNull()
      .references(() => challenges.id, { onDelete: 'cascade' }),
    seenAt: at('seen_at').notNull().defaultNow(),
  },
  (t) => [
    index('ix_view_challenge').on(t.challengeId),
    index('ix_view_member').on(t.memberId),
  ],
)

export const connectionKind = pgEnum('connection_kind', [
  'same_boat',
  'been_there',
])

export const connectionStatus = pgEnum('connection_status', [
  'pending',
  'accepted',
  'declined',
])

// The double opt-in (ADR 0004). No email is stored here: an address is read
// from members only for an accepted request and only by one of its parties
// (R-CONN-3,6). A request goes with either member (R-NFR-7); its challenge,
// being only context, is let go.
//
// uq_pending covers pending requests only, so the database itself refuses a
// second pending request between the same two members about the same
// challenge, or about none (R-CONN-5), while an answered one blocks nothing.
export const connectionRequests = pgTable(
  'connection_requests',
  {
    id: id('id').primaryKey(),
    requesterId: id('requester_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    targetId: id('target_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    challengeId: id('challenge_id').references(() => challenges.id, {
      onDelete: 'set null',
    }),
    kind: connectionKind('kind').notNull(),
    message: varchar('message', { length: 600 }),
    status: connectionStatus('status').notNull().default('pending'),
    createdAt: at('created_at').notNull().defaultNow(),
    respondedAt: at('responded_at'),
    // When the requester first opened an accepted request's contact; until
    // then it badges their nav (R-CONN-7).
    requesterSeenAt: at('requester_seen_at'),
  },
  (t) => [
    index('ix_req_target').on(t.targetId, t.status),
    index('ix_req_requester').on(t.requesterId),
    uniqueIndex('uq_pending')
      .on(t.requesterId, t.targetId, sql`coalesce(${t.challengeId}, '-')`)
      .where(sql`${t.status} = 'pending'`),
  ],
)

// One row per setting a host changed in the app (R-CFG-6, ADR 0031); no row
// means the deployment's value. Only the last change is kept, and erasing the
// member who made it leaves the value with nobody named.
export const settingOverrides = pgTable('setting_overrides', {
  key: varchar('key', { length: 64 }).primaryKey(),
  value: integer('value').notNull(),
  changedBy: id('changed_by').references(() => members.id, {
    onDelete: 'set null',
  }),
  changedAt: at('changed_at').notNull().defaultNow(),
})
