import { describe, expect, it } from 'vitest'
import { gameDefaults } from '../../../src/game/tuning'
import { availableActions } from './actions'
import { temptationScale } from './boss'
import { centreOf, distance } from './grid'
import { floors } from './floors'
import { fileInterval } from './rebel'
import {
  BODY_RADIUS,
  HEAT,
  startDay,
  type DayState,
  type Employee,
  type Tuning,
} from './state'
import { idle, step, type Input } from './step'
import { WALL } from './walls'

const { enabled: _enabled, ...defaults } = gameDefaults
const DT = 1 / 30

/** Tuning where nothing happens unless a test asks for it. */
const calm: Tuning = {
  ...defaults,
  dayLengthSeconds: 600,
  'teamLead.temptationEverySeconds': 600,
  'manager.temptationEverySeconds': 600,
  'teamLead.morningRebels': 0,
  'manager.morningRebels': 0,
  'rebel.morningGrey': 0,
  coolerVisitEverySeconds: 600,
  'rebel.fileEverySeconds': 600,
  'rebel.fileFloorSeconds': 600,
}

function run(state: DayState, seconds: number, input: Input = idle): DayState {
  let next = state
  for (let t = 0; t < seconds; t += DT) next = step(next, input, DT)
  return next
}

/** A day with everyone at their desk. */
function settled(level: number, tuning: Partial<Tuning> = {}): DayState {
  return run(startDay(level, { ...calm, ...tuning }, 7), 30)
}

function employee(state: DayState, id: number): Employee {
  const found = state.employees.find((e) => e.id === id)
  if (found === undefined) throw new Error(`no employee ${String(id)}`)
  return found
}

function standBeside(state: DayState, id: number): DayState {
  const next = structuredClone(state)
  const seat = floors[next.floor].cubicles[employee(next, id).cubicle]?.seat
  if (seat !== undefined)
    next.player.position = { x: seat.x + 1.5, y: seat.y + 0.5 }
  return next
}

function atCabinet(state: DayState): DayState {
  const next = structuredClone(state)
  next.player.position = centreOf(floors[next.floor].start)
  return next
}

describe('a day (R-GAME-3)', () => {
  it('walks everyone in from the entrance to their desk', () => {
    const start = startDay(1, calm, 7)
    const day = run(start, 30)

    expect(start.employees).toHaveLength(4)
    expect(start.employees.every((e) => e.doing.kind === 'arriving')).toBe(true)
    expect(day.employees.every((e) => e.doing.kind === 'atDesk')).toBe(true)
  })

  it('brings the morning rebels in boss mode, and grey ones in rebel mode', () => {
    const boss = startDay(4, { ...calm, 'manager.morningRebels': 3 }, 1)
    const rebel = startDay(16, { ...calm, 'rebel.morningGrey': 4 }, 1)

    expect(boss.mode).toBe('boss')
    expect(boss.employees.filter((e) => e.spirit === 'rebel')).toHaveLength(3)
    expect(rebel.mode).toBe('rebel')
    expect(rebel.floor).toBe('ceo')
    expect(rebel.employees.filter((e) => e.spirit === 'grey')).toHaveLength(4)
  })

  it('is won at 17:00, and then stays as it is', () => {
    const day = run(startDay(1, { ...calm, dayLengthSeconds: 30 }, 7), 31)

    expect(day.outcome).toBe('won')
    expect(step(day, idle, DT)).toBe(day)
  })

  it('leaves the day it steps from as it was, sharing the frozen tuning', () => {
    const before = settled(1, { 'teamLead.temptationEverySeconds': 1 })
    const copy = structuredClone({ ...before, tuning: { ...before.tuning } })

    const after = run(before, 5, { move: { x: 1, y: 0 } })

    expect({ ...before, tuning: { ...before.tuning } }).toEqual(copy)
    expect(after.tuning).toBe(before.tuning)
    expect(Object.isFrozen(after.tuning)).toBe(true)
  })

  it('plays out the same way from the same seed', () => {
    const tuning = { ...calm, 'teamLead.temptationEverySeconds': 2 }
    const a = run(startDay(1, tuning, 42), 20)
    const b = run(startDay(1, tuning, 42), 20)

    expect(a).toEqual(b)
  })
})

describe('a day’s pace (R-GAME-4, ADR 0046)', () => {
  const at = (clock: number): number =>
    temptationScale({ ...startDay(1, calm, 1), clock })

  it('turns no screen in the quiet start, then rises from morning to afternoon', () => {
    expect(at(calm.quietStartSeconds - 1)).toBe(0)
    expect(at(calm.quietStartSeconds)).toBeCloseTo(0.5)
    expect(at(calm.dayLengthSeconds)).toBeCloseTo(1.5)
  })

  it('keeps the day’s average rate', () => {
    const steps = 1000
    const span = calm.dayLengthSeconds - calm.quietStartSeconds
    let sum = 0
    for (let i = 0; i < steps; i += 1)
      sum += at(calm.quietStartSeconds + (span * (i + 0.5)) / steps)

    expect(sum / steps).toBeCloseTo(1)
  })
})

describe('boss mode (R-GAME-4, R-GAME-7)', () => {
  it('tempts the idle, turns the neglected rebel, and loses once more than half rebel', () => {
    const tuning = {
      'teamLead.temptationEverySeconds': 1,
      'teamLead.temptedGraceSeconds': 3,
    }
    const day = run(settled(1, tuning), 60)

    expect(
      day.employees.filter((e) => e.spirit === 'rebel').length,
    ).toBeGreaterThan(2)
    expect(day.outcome).toBe('lost')
  })

  it('takes a file at the cabinet and crushes a tempted employee with it', () => {
    let day = atCabinet(settled(1))
    day.employees[0] = {
      ...employee(day, 0),
      spirit: 'tempted',
      temptedAt: day.clock,
    }

    expect(availableActions(day).map((a) => a.kind)).toEqual(['takeFile'])
    day = step(day, { ...idle, act: 'takeFile' }, DT)
    day = standBeside(day, 0)
    expect(availableActions(day)).toEqual([{ kind: 'assign', target: 0 }])
    day = step(day, { ...idle, act: 'assign' }, DT)

    expect(employee(day, 0).spirit).toBe('grey')
    expect(day.player.carrying).toBe(false)
    expect(day.score).toBe(1)
  })

  it('hands out files anywhere along the two-tile desk, and nowhere else', () => {
    const day = settled(1)
    const at = (x: number, y: number): string[] => {
      day.player.position = { x, y }
      return availableActions(day).map((a) => a.kind)
    }
    const [first, second] = floors[day.floor].desk
    if (first === undefined || second === undefined) throw new Error('no desk')

    expect(at(first.x + 0.5, first.y + 1.5)).toEqual(['takeFile'])
    expect(at(second.x + 0.5, second.y + 1.5)).toEqual(['takeFile'])
    expect(at(second.x + 3.5, second.y + 3.5)).toEqual([])
  })

  it('needs two files for a rebel: the first only tempts them', () => {
    let day = settled(1)
    day.employees[0] = { ...employee(day, 0), spirit: 'rebel' }
    day.player.carrying = true
    day = step(standBeside(day, 0), { ...idle, act: 'assign' }, DT)

    expect(employee(day, 0).spirit).toBe('tempted')
    expect(day.score).toBe(0)
  })

  it('leaves a file on an empty desk, handed over when its employee sits down', () => {
    let day = standBeside(startDay(1, calm, 7), 0)
    day.player.carrying = true
    day.employees[0] = { ...employee(day, 0), spirit: 'tempted' }

    expect(availableActions(day)).toEqual([{ kind: 'leaveFile', target: 0 }])
    day = step(day, { ...idle, act: 'leaveFile' }, DT)
    expect(employee(day, 0).file).toBe(true)
    expect(day.player.carrying).toBe(false)
    day = run(day, 30)

    expect(employee(day, 0)).toMatchObject({ spirit: 'grey', file: false })
    expect(day.score).toBe(1)
  })

  it('keeps a grey employee who sits down to a left file busy, and tempts a rebel', () => {
    let day = startDay(1, calm, 7)
    day.employees[0] = { ...employee(day, 0), file: true }
    day.employees[1] = { ...employee(day, 1), file: true, spirit: 'rebel' }
    day = run(day, calm['teamLead.temptedGraceSeconds'] - 5)

    expect(employee(day, 0).spirit).toBe('grey')
    expect(employee(day, 0).workingUntil).toBeGreaterThan(calm.fileWorkSeconds)
    expect(employee(day, 1).spirit).toBe('tempted')
    expect(day.score).toBe(0)
  })

  it('leaves no file on a desk its employee sits at', () => {
    const day = standBeside(settled(1), 0)
    day.player.carrying = true

    expect(availableActions(day).map((a) => a.kind)).not.toContain('leaveFile')
  })

  it('offers nothing to assign to a grey employee', () => {
    const day = standBeside(settled(1), 0)
    day.player.carrying = true

    expect(availableActions(day)).toEqual([])
  })
})

describe('the boss’s body', () => {
  const left = { move: { x: -1, y: 0 } }
  const right = { move: { x: 1, y: 0 } }

  function besideEmployee(gap: number): DayState {
    const day = settled(1)
    const { x, y } = employee(day, 0).position
    day.player.position = { x: x + gap, y }
    return day
  }

  it('stops short of someone it walks into', () => {
    const day = run(besideEmployee(1), 1, left)

    expect(day.player.position.x).toBeGreaterThan(employee(day, 0).position.x)
    expect(
      distance(day.player.position, employee(day, 0).position),
    ).toBeGreaterThanOrEqual(2 * BODY_RADIUS)
  })

  it('bumps into the chair in front of its own desk', () => {
    const start = settled(1)
    const { chair, obstacles } = floors[start.floor]
    const reach = (obstacles[0]?.r ?? 0) + BODY_RADIUS
    start.player.position = { x: chair.x + 1.5, y: chair.y }
    const day = run(start, 1, left)

    expect(day.player.position.x).toBeGreaterThanOrEqual(chair.x + reach)
  })

  it('walks right up to a thin wall, and bumps into a plant', () => {
    const start = settled(1)
    const { plants } = floors[start.floor]
    const plant = plants[0]
    if (plant === undefined) throw new Error('no plant')
    start.player.position = { x: 2.5, y: 4.5 }
    const atWall = run(start, 2, left)
    start.player.position = { x: plant.x - 1.5, y: plant.y + 0.5 }
    const atPlant = run(start, 2, right)

    expect(atWall.player.position.x).toBeLessThan(1 + BODY_RADIUS)
    expect(atWall.player.position.x).toBeGreaterThanOrEqual(
      0.5 + WALL / 2 + BODY_RADIUS,
    )
    expect(atPlant.player.position.x).toBeLessThan(plant.x + 0.5 - BODY_RADIUS)
  })

  it('walks away from someone it stands too close to', () => {
    const start = besideEmployee(BODY_RADIUS)
    const day = run(start, 0.2, right)

    expect(day.player.position.x).toBeGreaterThan(start.player.position.x)
  })
})

describe('the office door (R-GAME-21)', () => {
  const left = { move: { x: -1, y: 0 } }
  const right = { move: { x: 1, y: 0 } }

  /** A day whose office door shut a while ago, the player at `at`. */
  function shutWith(at: { x: number; y: number }): DayState {
    const day = settled(1, { doorOpenSeconds: 5 })
    day.player.position = at
    return day
  }

  it('shuts by itself, and stops the player walking through', () => {
    const day = run(shutWith({ x: 5.5, y: 3.5 }), 1, right)

    expect(day.door.openness).toBe(0)
    expect(day.player.position.x).toBeLessThan(6.5 - BODY_RADIUS)
  })

  it('opens from outside the office, and lets the player in', () => {
    let day = shutWith({ x: 7.5, y: 3.5 })
    expect(availableActions(day).map((a) => a.kind)).toEqual(['openDoor'])
    day = run(step(day, { ...idle, act: 'openDoor' }, DT), 1)
    expect(day.door.openness).toBe(1)
    day = run(day, 1, left)

    expect(day.player.position.x).toBeLessThan(6)
  })

  it('stops swinging at a player in its way, and goes on once they step aside', () => {
    let day = shutWith({ x: 6, y: 3.6 })
    day = run(step(day, { ...idle, act: 'openDoor' }, DT), 1)
    expect(day.door.openness).toBeGreaterThan(0)
    expect(day.door.openness).toBeLessThan(1)
    expect(day.player.position).toEqual({ x: 6, y: 3.6 })
    day.player.position = { x: 4.5, y: 4.5 }
    day = run(day, 1)

    expect(day.door.openness).toBe(1)
  })

  it('will not shut on a player standing in the doorway', () => {
    const day = settled(1, { doorOpenSeconds: 5 })
    day.door = { openness: 1, opening: true, shutsAt: day.clock + 0.5 }
    day.player.position = { x: 6.5, y: 3.5 }

    expect(run(day, 2).door.openness).toBeGreaterThan(0)
  })
})

describe('meetings (R-GAME-6)', () => {
  function walkIntoMeeting(day: DayState): DayState {
    const next = structuredClone(day)
    const door = floors[next.floor].meetingDoor
    next.player.position = { x: door.x + 1.5, y: door.y + 0.5 }
    return run(next, 1, { move: { x: -1, y: 0 } })
  }

  it('calls the nearest employees in and sends them out grey', () => {
    const day = settled(4)
    for (const e of day.employees) e.spirit = 'tempted'
    for (const e of day.employees) e.temptedAt = 1000

    const meeting = walkIntoMeeting(day)
    expect(meeting.player.busy?.kind).toBe('meeting')
    expect(meeting.meetingHeld).toBe(true)
    const after = run(meeting, calm.meetingSeconds)

    expect(after.employees.filter((e) => e.spirit === 'grey')).toHaveLength(
      calm['manager.meetingSeats'],
    )
    expect(after.score).toBe(calm['manager.meetingSeats'])
    expect(after.player.busy).toBeNull()
  })

  it('holds one meeting a day, and none as Team Lead', () => {
    const held = { ...settled(4), meetingHeld: true }

    expect(walkIntoMeeting(held).player.busy).toBeNull()
    expect(walkIntoMeeting(settled(1)).player.busy).toBeNull()
  })
})

describe('the water cooler (R-GAME-5, R-GAME-11)', () => {
  function atCooler(day: DayState, spirits: Employee['spirit'][]): DayState {
    const next = structuredClone(day)
    const stands = floors[next.floor].coolers[0]?.stands ?? []
    spirits.forEach((spirit, id) => {
      const stand = stands[id]
      if (stand === undefined) return
      Object.assign(employee(next, id), {
        spirit,
        position: centreOf(stand),
        route: [],
        doing: { kind: 'atCooler', cooler: 0, since: next.clock },
      })
    })
    return next
  }

  it('lets a rebel tempt the grey colleague, then sends both back', () => {
    const day = run(
      atCooler(settled(4), ['rebel', 'grey']),
      calm.coolerChatSeconds + 1,
    )

    expect(employee(day, 1).spirit).toBe('tempted')
    expect(['toDesk', 'atDesk']).toContain(employee(day, 0).doing.kind)
  })

  it('starts a new chat afresh once the last one broke off', () => {
    const left = atCooler(settled(4), ['rebel', 'grey'])
    const broken = step(left, idle, DT)
    for (const id of [0, 1]) employee(broken, id).doing = { kind: 'toMeeting' }
    const later = run(broken, calm.coolerChatSeconds + 1)
    const pair = atCooler(later, ['grey', 'rebel'])

    expect(later.chats[0]).toBeNull()
    expect(employee(step(pair, idle, DT), 0).spirit).toBe('grey')
  })

  it('breaks it up when the boss talks to them', () => {
    let day = atCooler(settled(4), ['rebel', 'grey'])
    const cooler = floors.manager.coolers[0]?.cooler ?? { x: 0, y: 0 }
    day.player.position = { x: cooler.x + 0.5, y: cooler.y - 0.5 }

    expect(availableActions(day)).toEqual([{ kind: 'breakUp', cooler: 0 }])
    day = step(day, { ...idle, act: 'breakUp' }, DT)
    day = run(day, calm.speechSeconds)

    expect(employee(day, 1).spirit).toBe('grey')
    expect(employee(day, 1).doing.kind).toBe('toDesk')
  })

  it('stresses a rebel who meets a grey colleague in rebel mode', () => {
    const day = run(atCooler(settled(16), ['rebel', 'grey']), DT * 2)

    expect(employee(day, 0).heat).toBe(HEAT.hot)
  })

  it('sends only a grey employee to an empty cooler in rebel mode', () => {
    const day = settled(16, { coolerVisitEverySeconds: 1 })
    day.employees[5] = { ...employee(day, 5), spirit: 'grey' }
    const later = run(day, 3)
    const first = later.employees.filter(
      (e) => e.doing.kind === 'toCooler' || e.doing.kind === 'atCooler',
    )

    expect(first.length).toBeGreaterThan(0)
    expect(first.some((e) => e.spirit === 'grey')).toBe(true)
  })

  it('sends someone to a cooler now and then', () => {
    const day = run(settled(4, { coolerVisitEverySeconds: 1 }), 5)

    expect(
      day.employees.some((e) =>
        ['toCooler', 'atCooler', 'toDesk'].includes(e.doing.kind),
      ),
    ).toBe(true)
  })
})

describe('rebel mode (R-GAME-8..11)', () => {
  it('lands files quicker each level, never below the floor', () => {
    const day = settled(16, {
      'rebel.fileEverySeconds': 10,
      'rebel.fileStepPercent': 10,
      'rebel.fileFloorSeconds': 5,
    })

    expect(fileInterval(day)).toBe(10)
    expect(fileInterval({ ...day, level: 17 })).toBeCloseTo(9)
    expect(fileInterval({ ...day, level: 40 })).toBe(5)
  })

  it('heats up an employee with a file left on the desk until they turn grey', () => {
    const day = settled(16)
    day.employees[0] = { ...employee(day, 0), file: true, heatAt: day.clock }
    const stage = calm['rebel.heatStageSeconds']

    const hot = run(day, stage * 2 + 0.5)
    expect(employee(hot, 0).heat).toBe(HEAT.hot)
    const boiled = run(hot, stage * 2)
    expect(employee(boiled, 0).spirit).toBe('grey')
  })

  it('lands a file on someone at their desk', () => {
    const day = settled(16, {
      'rebel.fileEverySeconds': 1,
      'rebel.fileFloorSeconds': 1,
    })

    expect(day.employees.some((e) => e.file)).toBe(true)
  })

  it('helps with a file, offering a break beside it as a choice', () => {
    let day = settled(16)
    day.employees[0] = { ...employee(day, 0), file: true, heatAt: day.clock }
    day = standBeside(day, 0)

    expect(availableActions(day).map((a) => a.kind)).toEqual(['help', 'break'])
    day = step(day, { ...idle, act: 'help' }, DT)
    day = run(day, calm['rebel.helpSeconds'])

    expect(employee(day, 0).file).toBe(false)
    expect(day.score).toBe(1)
  })

  it('sends someone on a break, back cool, and waits before the next', () => {
    let day = settled(16)
    day.employees[0] = { ...employee(day, 0), heat: HEAT.hot }
    day = step(standBeside(day, 0), { ...idle, act: 'break' }, DT)

    expect(employee(day, 0).doing.kind).toBe('leaving')
    expect(availableActions(standBeside(day, 1)).map((a) => a.kind)).toEqual([])
    day = run(day, calm['rebel.breakSeconds'] + 30)
    expect(employee(day, 0).heat).toBe(HEAT.cool)
    expect(employee(day, 0).doing.kind).toBe('atDesk')
  })

  it('talks a grey employee back into a rebel, whose file heats them afresh', () => {
    let day = settled(16)
    day.employees[0] = {
      ...employee(day, 0),
      spirit: 'grey',
      file: true,
      heatAt: 0,
    }
    day = step(standBeside(day, 0), { ...idle, act: 'talk' }, DT)
    day = run(day, calm['rebel.talkSeconds'] + 1)

    expect(employee(day, 0).spirit).toBe('rebel')
    expect(employee(day, 0).heat).toBe(HEAT.cool)
  })

  it('sends two grey employees to a masterclass, once a day, and they come back rebels', () => {
    let day = atCabinet(settled(16))
    for (const id of [0, 1, 2])
      day.employees[id] = { ...employee(day, id), spirit: 'grey' }

    expect(availableActions(day).map((a) => a.kind)).toContain('masterclass')
    day = step(day, { ...idle, act: 'masterclass', chosen: [0, 1, 2] }, DT)
    expect(employee(day, 2).doing.kind).toBe('atDesk')
    expect(availableActions(day).map((a) => a.kind)).not.toContain(
      'masterclass',
    )
    day = run(day, calm['rebel.masterclassSeconds'] + 30)

    expect([0, 1].map((id) => employee(day, id).spirit)).toEqual([
      'rebel',
      'rebel',
    ])
  })

  it('loses once more than half the office is grey', () => {
    const day = settled(16)
    for (const e of day.employees.slice(0, 17)) e.spirit = 'grey'

    expect(step(day, idle, DT).outcome).toBe('lost')
  })
})
