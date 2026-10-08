import { FIRST_REBEL_LEVEL } from '../../src/game/levels'
import type { GameHint } from '../../src/services/game'
import { floorOf, type Tuning } from './core/state'

export type { GameHint }

const words: Readonly<Record<GameHint, { title: string; text: string }>> = {
  firstDay: {
    title: 'Keep your workers busy',
    text:
      'You are the boss. When a screen turns to Corporate Rebels, that ' +
      'worker is tempted: walk to your desk, take a file from the stack and ' +
      'hand it to them before they turn rebel. A rebel needs two files. ' +
      'More than half rebels, and the day is lost.',
  },
  meeting: {
    title: 'Meetings',
    text:
      'Once a day, walk into the meeting room: the employees nearest it come ' +
      'in and leave grey. You are stuck there until it ends.',
  },
  cooler: {
    title: 'The water cooler',
    text:
      'A rebel chatting at the cooler tempts the colleague. Walk up and break ' +
      'it up, or bring a file: that breaks it up too.',
  },
  rebelMode: {
    title: 'You are a rebel now',
    text:
      'Files land on desks: help before heads boil, and send the overheated ' +
      'on a break. Talk grey colleagues back into rebels, and send them to a ' +
      'masterclass from your desk once a day. More than half grey, and the ' +
      'day is lost.',
  },
}

/** Every hint, in the order a player meets them. */
export const allHints: readonly GameHint[] = [
  'firstDay',
  'cooler',
  'meeting',
  'rebelMode',
]

/** A hint's words. */
export const hintWords = (hint: GameHint): { title: string; text: string } =>
  words[hint]

/** The hints a day brings that the member has not seen yet, once each
 * (R-GAME-18). */
export function hintsDue(
  level: number,
  tuning: Tuning,
  seen: readonly string[],
): GameHint[] {
  const floor = floorOf(level)
  const due: GameHint[] =
    level >= FIRST_REBEL_LEVEL
      ? ['rebelMode']
      : [
          'firstDay',
          ...(floor === 'teamLead' ? [] : (['meeting'] as const)),
          ...(tuning[`${floor}.coolers`] > 0 ? (['cooler'] as const) : []),
        ]
  return due.filter((hint) => !seen.includes(hint))
}
