import type { Mailer } from './mailer.js'

/** One follower's notification of a challenge posted in a trend. */
export interface TrendNote {
  recipientId: string
  to: string
  authorId: string
  authorName: string
  trend: string
  challengeId: string
}

/** Where a new challenge is seen: the deck, opened at its card (R-OFF-7). */
export function deckAt(challengeId: string): string {
  return `/offer?challenge=${encodeURIComponent(challengeId)}`
}

/** Emails a follower that a challenge was posted in their trend, with a link
 * to it in the deck; never the challenge's words (R-ASK-9, R-NAV-9). The
 * entry is erased with its author (R-MSG-6). */
export function createTrendNotice(deps: {
  mailer: Mailer
  publicUrl: string
}): (note: TrendNote) => Promise<void> {
  return async (note) => {
    const link = new URL(deckAt(note.challengeId), deps.publicUrl).toString()
    await deps.mailer.send({
      memberId: note.recipientId,
      aboutMemberId: note.authorId,
      to: note.to,
      kind: 'trend_challenge',
      subject: `${note.authorName} posted a challenge in ${note.trend}`,
      text:
        `${note.authorName} posted a challenge in ${note.trend}, a trend you follow on Rebel Match.\n\n` +
        `See it, and say if you are in the same boat or have been there, here:\n${link}\n`,
    })
  }
}
