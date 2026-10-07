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
    // The first confirmation of any consent words: onboarding_completed
    // reports only the onboarding it ends (R-ANA-6).
    firstOnboardedAt: at('first_onboarded_at'),
    // The first answer on the usage step of onboarding, either one, so
    // onboarding_completed goes out at most once (R-ANA-6).
    usageAnsweredAt: at('usage_answered_at'),
    analyticsConsentVersion: varchar('analytics_consent_version', {
      length: 20,
    }),
    analyticsConsentAt: at('analytics_consent_at'),
    analyticsId: id('analytics_id').notNull(),
    // The Matches badge counts only what arrived after this (R-MINE-4).
    matchesSeenAt: at('matches_seen_at'),
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

// One row per first interaction with the entry screen opened with a token that
// names an invite, once per tab, and nothing about who opened it (R-STAT-6,
// ADR 0038, ADR 0039). Read back only as a count per invite for the invite
// links screen; it goes with the invite.
export const inviteOpens = pgTable(
  'invite_opens',
  {
    id: id('id').primaryKey(),
    inviteId: id('invite_id')
      .notNull()
      .references(() => invites.id, { onDelete: 'cascade' }),
    openedAt: at('opened_at').notNull().defaultNow(),
  },
  (t) => [index('ix_open_invite').on(t.inviteId)],
)

export const outboxKind = pgEnum('outbox_kind', [
  'magic_link',
  'approval',
  'connection_request',
  'admin_notice',
  'connection_accepted',
  'connection_added',
  'notification_digest',
  'trend_challenge',
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
    // When the target first opened it: as they accepted it, or later for one
    // accepted at once between members already connected (R-CONN-9).
    targetSeenAt: at('target_seen_at'),
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

export const notificationType = pgEnum('notification_type', [
  'connection_request',
  'new_connection',
  'trend_challenge',
  'applicant',
])

export const notificationMailStatus = pgEnum('notification_mail_status', [
  'waiting',
  'mailed',
  'skipped',
  'failed',
])

// One row per recipient and event, kept in the app whatever reaches the inbox
// (R-NOTE-4, ADR 0037). It holds references, never words: the screen words it
// from the current names when it is shown, and the cascades erase it with its
// recipient, the member it is about, or what it refers to (R-NOTE-11). The
// mail columns serve the worker (R-NOTE-7..10).
export const notifications = pgTable(
  'notifications',
  {
    id: id('id').primaryKey(),
    recipientId: id('recipient_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    type: notificationType('type').notNull(),
    aboutMemberId: id('about_member_id').references(() => members.id, {
      onDelete: 'cascade',
    }),
    connectionId: id('connection_id').references(() => connectionRequests.id, {
      onDelete: 'cascade',
    }),
    challengeId: id('challenge_id').references(() => challenges.id, {
      onDelete: 'cascade',
    }),
    createdAt: at('created_at').notNull().defaultNow(),
    seenAt: at('seen_at'),
    hidden: boolean('hidden').notNull().default(false),
    mailStatus: notificationMailStatus('mail_status')
      .notNull()
      .default('waiting'),
    skippedReason: varchar('skipped_reason', { length: 20 }),
    mailedAt: at('mailed_at'),
    mailedCadence: varchar('mailed_cadence', { length: 20 }),
    outboxId: id('outbox_id').references(() => outbox.id, {
      onDelete: 'set null',
    }),
    attempts: integer('attempts').notNull().default(0),
    // When it may go next: its cadence's window, or a retry (R-NOTE-7,10).
    nextAttemptAt: at('next_attempt_at'),
    // Held by the server mailing it until then, apart from when it is due,
    // so a member's new choice cannot release one being sent (R-NOTE-3).
    claimedUntil: at('claimed_until'),
  },
  (t) => [
    index('ix_note_recipient').on(t.recipientId, t.createdAt),
    index('ix_note_waiting').on(t.mailStatus, t.nextAttemptAt),
  ],
)

export const notificationCadence = pgEnum('notification_cadence', [
  'immediately',
  'every_15_minutes',
  'hourly',
  'daily',
  'in_app',
  'off',
])

// A member's choice of how one type of notification reaches them (R-NOTE-2,
// R-NOTE-3). No row means the type's default; choosing it again deletes the
// row.
export const notificationSettings = pgTable(
  'notification_settings',
  {
    memberId: id('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    type: notificationType('type').notNull(),
    cadence: notificationCadence('cadence').notNull(),
  },
  (t) => [primaryKey({ columns: [t.memberId, t.type] })],
)

// Every member a mail quotes, where `outbox.about_member_id` holds only one:
// a digest names several, and erasing any of them erases the entry (R-MSG-6).
export const outboxQuotes = pgTable(
  'outbox_quotes',
  {
    outboxId: id('outbox_id')
      .notNull()
      .references(() => outbox.id, { onDelete: 'cascade' }),
    memberId: id('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.outboxId, t.memberId] }),
    index('ix_outbox_quotes_member').on(t.memberId),
  ],
)
