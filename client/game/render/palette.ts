/** The colours the office is drawn in. The office is grey; colour belongs to
 * rebellion, and comes from happy mode's own tokens (R-GAME-18, R-LOOK-3). */
export interface Palette {
  floor: string
  office: string
  meeting: string
  wall: string
  furniture: string
  screen: string
  paper: string
  ink: string
  /** Rebel colours, for hair, screens and the CR logo. */
  rebel: readonly string[]
  heat: readonly string[]
}

const greys = {
  floor: '#d9d7d2',
  office: '#cfccc5',
  meeting: '#c4c1ba',
  wall: '#4a4845',
  furniture: '#8d8a84',
  screen: '#5c5a56',
  paper: '#f4f2ee',
  ink: '#1c1b19',
}

const REBEL_TOKENS = ['--accent', '--door', '--card', '--token'] as const
const FALLBACK_REBEL = ['#ff2e93', '#38d6a6', '#ffd23f', '#4ea8ff']
const HEAT = ['#f0a35e', '#e8603c', '#c0262d']

/** The palette, with rebel colours read from the page's happy-mode tokens. */
export function palette(read: (token: string) => string): Palette {
  const rebel = REBEL_TOKENS.map(
    (token, index) =>
      read(token).trim() || (FALLBACK_REBEL[index] ?? '#ff2e93'),
  )
  return { ...greys, rebel, heat: HEAT }
}

const SKIN = ['#f1d3b8', '#e0b18c', '#c68a63', '#9a6544', '#6e4a33', '#4a3022']
const HAIR = ['#2b2522', '#5a3b26', '#8a6a3f', '#c9b18a', '#1d1d1d', '#6b6b6b']
const SUITS = ['#3c3b39', '#4b4a47', '#56544f', '#2f3236']

/** One person's look, the same every day: a skin tone, hair and a suit. */
export interface Look {
  skin: string
  hair: string
  suit: string
  /** The colour their hair turns as a rebel. */
  rebelHair: number
}

export function lookOf(id: number): Look {
  return {
    skin: SKIN[(id * 5) % SKIN.length] ?? '#e0b18c',
    hair: HAIR[(id * 7) % HAIR.length] ?? '#2b2522',
    suit: SUITS[id % SUITS.length] ?? '#3c3b39',
    rebelHair: id,
  }
}

const LUMA = { r: 0.299, g: 0.587, b: 0.114 }
const HEX = 16
const CHANNEL = 255

/** The grey with the colour's own lightness: a grey employee is the whole
 * figure drained of colour, never a change of skin (R-GAME-18). */
export function greyOf(colour: string): string {
  const value = Number.parseInt(colour.slice(1), HEX)
  const r = (value >> 16) & CHANNEL
  const g = (value >> 8) & CHANNEL
  const b = value & CHANNEL
  const luma = Math.round(LUMA.r * r + LUMA.g * g + LUMA.b * b)
  const part = luma.toString(HEX).padStart(2, '0')
  return `#${part}${part}${part}`
}

/** The palette as the page shows it now. */
export function pagePalette(): Palette {
  const style = getComputedStyle(document.documentElement)
  return palette((token) => style.getPropertyValue(token))
}

/** A canvas's 2D context, or null where there is none to draw on. */
export function contextOf(
  canvas: HTMLCanvasElement | null,
): CanvasRenderingContext2D | null {
  return canvas?.getContext('2d') ?? null
}
