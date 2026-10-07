import { and, count, eq, gt, isNotNull, lt, or, sql } from 'drizzle-orm'
import type { Database } from '../db/connect.js'
import { gameDays, gamePlayers, members } from '../db/schema.js'
import type { DayRecord, Progress } from '../game/levels.js'
import type { GameStore, Place, Player } from './game.js'

const onBoard = and(
  isNotNull(gamePlayers.bestLevel),
  isNotNull(gamePlayers.bestSeconds),
  eq(members.status, 'active'),
)

async function placeOf(db: Database, memberId: string): Promise<Place | null> {
  const [own] = await db
    .select({ level: gamePlayers.bestLevel, seconds: gamePlayers.bestSeconds })
    .from(gamePlayers)
    .innerJoin(members, eq(members.id, gamePlayers.memberId))
    .where(and(eq(gamePlayers.memberId, memberId), onBoard))
  if (own === undefined || own.level === null || own.seconds === null)
    return null
  const ahead = or(
    gt(gamePlayers.bestLevel, own.level),
    and(
      eq(gamePlayers.bestLevel, own.level),
      lt(gamePlayers.bestSeconds, own.seconds),
    ),
  )
  const [counts] = await db
    .select({
      ahead: sql<number>`count(*) filter (where ${ahead})`.mapWith(Number),
      of: count(),
    })
    .from(gamePlayers)
    .innerJoin(members, eq(members.id, gamePlayers.memberId))
    .where(onBoard)
  return counts === undefined
    ? null
    : { position: counts.ahead + 1, of: counts.of }
}

async function playerOf(
  db: Database,
  memberId: string,
): Promise<Player | null> {
  const [row] = await db
    .select()
    .from(gamePlayers)
    .where(eq(gamePlayers.memberId, memberId))
  if (row === undefined) return null
  return {
    pseudonym: row.pseudonym,
    shared: row.shared,
    currentLevel: row.currentLevel,
    highestLevel: row.highestLevel,
    bestLevel: row.bestLevel,
    bestSeconds: row.bestSeconds,
    totalSeconds: row.totalSeconds,
    hintsSeen: row.hintsSeen,
  }
}

async function recordDayIn(
  db: Database,
  day: DayRecord & { id: string; memberId: string },
  progress: Progress,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(gameDays).values({
      id: day.id,
      memberId: day.memberId,
      level: day.level,
      outcome: day.outcome,
      playSeconds: day.playSeconds,
    })
    await tx
      .update(gamePlayers)
      .set({ ...progress, updatedAt: sql`now()` })
      .where(eq(gamePlayers.memberId, day.memberId))
  })
}

/** 9toRevolution players and their day log over Postgres (design §2). */
export function createGameStore(db: Database): GameStore {
  return {
    player: (memberId) => playerOf(db, memberId),
    pseudonyms: async () => {
      const rows = await db
        .select({ pseudonym: gamePlayers.pseudonym })
        .from(gamePlayers)
      return new Set(rows.map((row) => row.pseudonym))
    },
    create: async (memberId, pseudonym) => {
      const written = await db
        .insert(gamePlayers)
        .values({ memberId, pseudonym })
        .onConflictDoNothing()
        .returning({ memberId: gamePlayers.memberId })
      return written.length > 0
    },
    recordDay: (day, progress) => recordDayIn(db, day, progress),
    share: async (memberId, shared) => {
      await db
        .update(gamePlayers)
        .set({ shared, updatedAt: sql`now()` })
        .where(eq(gamePlayers.memberId, memberId))
    },
    seeHint: async (memberId, hint) => {
      await db
        .update(gamePlayers)
        .set({
          hintsSeen: sql`${gamePlayers.hintsSeen} || ${JSON.stringify([hint])}::jsonb`,
        })
        .where(
          and(
            eq(gamePlayers.memberId, memberId),
            sql`not ${gamePlayers.hintsSeen} ? ${hint}`,
          ),
        )
    },
    place: (memberId) => placeOf(db, memberId),
  }
}
