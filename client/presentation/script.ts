import type { Cue, Script } from './director'

/** The summit film, as decided with the maintainer (R-PRES-2, ADR 0058).
 * People appear only as handles; the cast file names them. The founders'
 * challenges stand in until the real ones arrive. */
export interface PresentationScript extends Script {
  founders: {
    handles: [string, string]
    challenges: [string, string]
  }
}

const words = (from: number, to: number, text: string): Cue => ({
  kind: 'words',
  from,
  to,
  text,
})

const show = (
  from: number,
  to: number,
  part: Extract<Cue, { kind: 'show' }>['part'],
  amount: [number, number] = [0, 1],
): Cue => ({ kind: 'show', from, to, part, amount })

const look = (
  at: number,
  aim: Extract<Cue, { kind: 'camera' }>['aim'],
  over = 2,
): Cue => ({ kind: 'camera', at, aim, over })

const grow = (from: number, to: number, progress: [number, number]): Cue => ({
  kind: 'grow',
  from,
  to,
  progress,
})

const light = (
  from: number,
  to: number,
  what: Extract<Cue, { kind: 'light' }>['what'],
): Cue => ({ kind: 'light', from, to, what })

const label = (
  from: number,
  to: number,
  who: string[] | { group: string },
): Cue => ({
  kind: 'label',
  from,
  to,
  who,
})

// Act 1, invented: two founders meet over a shared challenge (R-PRES-4).
const beginning: Cue[] = [
  show(0, 2, 'founders'),
  look(0, { on: 'founders' }, 0),
  words(1, 4, 'Just like every movement,'),
  words(4, 8, 'the rebel movement started small.'),
  look(8, { on: 'person', who: 'founder-one' }),
  label(8, 14, ['founder-one']),
  show(9, 10, 'founderMoons', [0, 0.5]),
  look(14, { on: 'person', who: 'founder-two' }),
  label(14, 20, ['founder-two']),
  show(15, 16, 'founderMoons', [0.5, 1]),
  look(20, { on: 'founders' }),
  show(20, 21, 'cards'),
  show(26, 30, 'founderLink'),
  light(27, 32, { on: 'founderLink' }),
  show(31, 32, 'cards', [1, 0]),
]

// Act 2, real: the network grows and the camera visits who shaped it.
const growing: Cue[] = [
  look(32, { on: 'network' }, 6),
  show(32, 34, 'network'),
  grow(32, 48, [0, 0.3]),
  words(33, 38, 'But if you believe, movements will grow.'),
  words(44, 49, 'Member by member, it becomes stronger.'),
  grow(48, 60, [0.3, 0.45]),
  words(50, 54, 'Some inspired us through books.'),
  look(54, { on: 'person', who: 'author-one' }, 1.5),
  look(57, { on: 'person', who: 'author-two' }, 1.5),
  label(54, 60, { group: 'authors' }),
  light(54, 60, { on: 'group', group: 'authors' }),
  look(60, { on: 'network' }),
  grow(60, 64, [0.45, 0.5]),
  words(60, 64, 'Some laid the foundations years ago.'),
  look(64, { on: 'person', who: 'pioneer' }),
  label(64, 69, ['pioneer']),
  light(64, 69, { on: 'person', who: 'pioneer' }),
  look(69, { on: 'network' }),
  grow(69, 86, [0.5, 0.78]),
  words(69, 72, 'Some do the work on the ground'),
  words(72, 75, 'every day.'),
]

// Still act 2: challenges, and why we connect.
const connecting: Cue[] = [
  {
    kind: 'words',
    from: 80,
    to: 87,
    text: 'Some of us face challenges.',
    swap: { word: 'Some', with: 'All', at: 83.5 },
  },
  grow(86, 96, [0.78, 0.9]),
  look(88, { on: 'moon' }, 1.5),
  light(88, 93, { on: 'moon' }),
  look(93, { on: 'network' }),
  words(93, 96, 'That’s why we’re here.'),
  words(96, 100, 'That’s why we connect.'),
  grow(96, 110, [0.9, 1]),
  light(100, 105, { on: 'links' }),
  look(105, { on: 'founders' }),
  light(105, 111, { on: 'founderLink' }),
  words(
    105,
    111,
    'The rebel movement started with two people connecting over a shared idea.',
  ),
]

// Act 3, real: the figures since launch (R-PRES-7).
const figures: Cue[] = [
  look(111, { on: 'network' }),
  words(111, 117, 'Since launch, {members} people joined Rebel Match.'),
  light(111, 117, { on: 'nodes' }),
  words(117, 122, '{challenges} challenges were posted'),
  light(117, 122, { on: 'moons' }),
  words(122, 127, 'and {connections} connections made.'),
  light(122, 127, { on: 'links' }),
  words(127, 131, 'That’s why we built Rebel Match…'),
  look(131, { on: 'person', who: 'builder' }),
  label(131, 136, ['builder']),
  light(131, 136, { on: 'person', who: 'builder' }),
]

// Act 4, invented: growth past today, until the network is a point.
const future: Cue[] = [
  look(136, { on: 'network' }),
  words(136, 140, 'This is only the start!'),
  words(140, 145, 'We are defining the future of work.'),
  show(141, 152, 'future'),
  {
    kind: 'camera',
    at: 141,
    aim: { on: 'beyond' },
    over: 12,
    ease: 'accelerate',
  },
  { kind: 'flash', at: 153, over: 1.2 },
  show(153, 153.05, 'founders', [1, 0]),
  show(153, 153.05, 'network', [1, 0]),
  show(153, 153.05, 'future', [1, 0]),
]

// Act 5: a lone dot, whoever is watching, and everyone around them.
const thanks: Cue[] = [
  show(153, 154, 'lone'),
  look(153, { on: 'lone' }, 0),
  words(154, 158, 'Thanks for joining.'),
  show(158, 166, 'rebirthNodes'),
  look(158, { on: 'network' }, 6),
  {
    kind: 'words',
    from: 158,
    to: 168,
    text: 'Thanks for fighting every day to make work',
    cycle: ['…', 'better.', 'more humane.', 'fun.'],
  },
  words(168, 172, 'Even if it’s not always easy.'),
  show(172, 178, 'rebirthLinks'),
  words(176, 180, 'Thanks for connecting.'),
  look(180, { on: 'lone' }, 4),
  words(181, 187, 'Thank you for being part of this movement.'),
  look(187, { on: 'network' }, 5),
  light(188, 194, { on: 'group', group: 'developers' }),
  label(188, 194, { group: 'developers' }),
  light(194, 200, { on: 'group', group: 'betaTesters' }),
  label(194, 200, { group: 'betaTesters' }),
  light(200, 205, { on: 'everyone' }),
]

export const script: PresentationScript = {
  length: 205,
  featuredMoonAt: 0.84,
  founders: {
    handles: ['founder-one', 'founder-two'],
    challenges: [
      'Why does work feel like a cage for so many people? There has to be a better way.',
      'I want to find the companies that already work differently, and learn from them.',
    ],
  },
  cues: [
    ...beginning,
    ...growing,
    ...connecting,
    ...figures,
    ...future,
    ...thanks,
  ],
}
