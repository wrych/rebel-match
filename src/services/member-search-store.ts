import {
  and,
  asc,
  desc,
  eq,
  ne,
  sql,
  type SQL,
  type SQLWrapper,
} from 'drizzle-orm'
import type { Database } from '../db/connect.js'
import { isReachableMember } from '../db/member-predicates.js'
import { connectionRequests as r, members, sectors } from '../db/schema.js'
import { ACCENTS } from '../search/query.js'
import type {
  MemberCard,
  MemberSearchStore,
  SearchTerms,
} from './member-search.js'
import { companySizeLabel, sectorLabel } from './profile-labels.js'

const SEPARATORS = `[[:space:]/.,;:'’"()&+_‐‑‒–—-]+`

// Each word of a field between single spaces, folded as the parser folds a
// term, so ' ' || term matches the start of a word (R-FIND-2).
function folded(field: SQLWrapper): SQL<string> {
  const plain = sql`regexp_replace(normalize(lower(coalesce(${field}, '')), NFD), ${ACCENTS}, '', 'g')`
  return sql<string>`(' ' || btrim(regexp_replace(${plain}, ${SEPARATORS}, ' ', 'g')) || ' ')`
}

const sectorText = sql`(SELECT ${sectors.label} || ' ' || ${sectors.key} FROM ${sectors} WHERE ${sectors.key} = ${members.sector})`

const fieldText: Readonly<Record<keyof SearchTerms, SQL<string>>> = {
  name: folded(members.name),
  company: folded(members.org),
  title: folded(members.jobTitle),
  sector: folded(sectorText),
}

function likeEscaped(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`)
}

function startsAWord(text: SQL<string>, term: string): SQL {
  return sql`${text} LIKE ${`% ${likeEscaped(term)}%`}`
}

function isAWord(text: SQL<string>, term: string): SQL {
  return sql`${text} LIKE ${`% ${likeEscaped(term)} %`}`
}

function matchesAll(terms: SearchTerms): SQL[] {
  return Object.entries(terms).flatMap(([field, values]) =>
    values.map((term) =>
      startsAWord(fieldText[field as keyof SearchTerms], term),
    ),
  )
}

function wholeWords(terms: SearchTerms, fields: (keyof SearchTerms)[]): SQL[] {
  const hits = fields.flatMap((field) =>
    terms[field].map(
      (term) =>
        sql`(CASE WHEN ${isAWord(fieldText[field], term)} THEN 1 ELSE 0 END)`,
    ),
  )
  return hits.length === 0 ? [] : [desc(sql.join(hits, sql` + `))]
}

// The newest accepted request between the viewer and the member, whatever
// it was about, so a card can lead to the contact (R-CONN-8).
const memberColumn = sql`${members}.${sql.identifier('id')}`

const connectionWith = (viewerId: string): SQL<string | null> =>
  sql<
    string | null
  >`(SELECT ${r.id} FROM ${r} WHERE ${r.status} = 'accepted' AND ((${r.requesterId} = ${viewerId} AND ${r.targetId} = ${memberColumn}) OR (${r.requesterId} = ${memberColumn} AND ${r.targetId} = ${viewerId})) ORDER BY ${r.respondedAt} DESC NULLS LAST LIMIT 1)`

const baseColumns = {
  memberId: members.id,
  name: sql<string>`${members.name}`,
  jobTitle: members.jobTitle,
  org: members.org,
  sector: sectorLabel,
  companySize: companySizeLabel,
}

const cardColumns = (
  viewerId: string,
): typeof baseColumns & { connectionId: SQL<string | null> } => ({
  ...baseColumns,
  connectionId: connectionWith(viewerId),
})

/** Member search over Postgres: every term a parameter of a `LIKE` on folded
 * text, its `%`, `_` and `\` escaped; ranked by whole name words, then whole
 * words elsewhere, then name (R-FIND-2,3, ADR 0062). */
export function createMemberSearchStore(db: Database): MemberSearchStore {
  return {
    search: async (callerId, terms, limit): Promise<MemberCard[]> =>
      db
        .select(cardColumns(callerId))
        .from(members)
        .where(
          and(
            isReachableMember(),
            eq(members.findable, true),
            ne(members.id, callerId),
            ...matchesAll(terms),
          ),
        )
        .orderBy(
          ...wholeWords(terms, ['name']),
          ...wholeWords(terms, ['company', 'title', 'sector']),
          asc(members.name),
          asc(members.id),
        )
        .limit(limit),
    card: async (viewerId, memberId) => {
      const [row] = await db
        .select({
          ...cardColumns(viewerId),
          reachable: isReachableMember(),
          findable: members.findable,
        })
        .from(members)
        .where(eq(members.id, memberId))
      if (row === undefined) return null
      const { reachable: isReachable, findable, ...card } = row
      return { card, reachable: isReachable, findable }
    },
  }
}
