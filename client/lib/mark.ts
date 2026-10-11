/** The Rebel Match mark's geometry, in its 480-unit square (R-LOOK-5). */

/** One R's outer edge, in the R's own units. */
export const MARK_OUTLINE =
  'M 39.643585,106.78487 V 85.48201 h 9.583887 9.583888 l 9.120152,21.14849 9.120151,21.14849 22.171824,0.16184 22.171823,0.16184 -10.41248,-21.4647 C 105.25597,94.832385 99.816648,83.729507 98.895457,81.964908 c -0.92119,-1.764599 -1.674896,-3.333348 -1.674896,-3.486105 0,-0.152763 1.323794,-1.170533 2.941769,-2.261721 7.38226,-4.978694 14.15185,-15.463931 16.185,-25.068507 1.43469,-6.777433 0.93807,-17.397044 -1.10397,-23.607207 C 112.26241,18.475884 106.64219,11.194155 98.881204,6.3420655 89.738315,0.62602927 85.037725,0.17270381 37.293505,0.40254252 L 0.5734947,0.57931118 0.42386977,64.33352 0.27424542,128.08773 H 19.958915 39.643585 Z'
/** The hole in the R's bowl, in the R's own units. */
export const MARK_COUNTER =
  'M 39.643585,43.493766 V 29.909335 l 14.834884,0.02966 c 12.754546,0.0255 15.115889,0.177032 16.838733,1.08058 7.122842,3.735581 8.590749,16.524336 2.598702,22.64043 -1.172109,1.196375 -3.083758,2.453342 -4.248106,2.793268 -1.164353,0.339919 -8.396127,0.619592 -16.070609,0.621482 l -13.953604,0.0034 z'
/** One R, its counter cut out by the even-odd rule. */
export const MARK_R = `${MARK_OUTLINE} ${MARK_COUNTER}`

/** The side of the mark's square. */
export const MARK_SIZE = 480
/** Its corners' radius where they are rounded, as a share of the side; the
 * page's `--mark-radius`. */
export const MARK_RADIUS = 0.18
/** Where the left R sits in the square, and its scale. */
export const MARK_PLACE = { x: 44.6, y: 142, scale: 1.61 }
/** How far each R stands out from the centre at rest, the Rs just apart. */
export const MARK_APART = -4
/** How far each R moves in to make the figure. */
export const MARK_OVERLAP = 64
/** The happy colour bands: where the first starts, and each one's height. */
export const MARK_BAND_TOP = 142
export const MARK_BAND_HEIGHT = 41.25
export const MARK_BANDS = 5
/** How far each band reaches into the next, so no seam shows between them. */
export const MARK_BAND_OVERLAP = 1
/** The bands as happy mode colours them, top to bottom: its accent, card,
 * door and token colours and a purple. Where the mode cannot be read, as in
 * the game, the mark is drawn in these. */
export const MARK_HAPPY_BANDS = [
  '#ff2e93',
  '#ffd23f',
  '#38d6a6',
  '#4ea8ff',
  '#9b6bff',
] as const

/** The intro's phases, as shares of its length: the Rs meet, the right eye
 * closes and opens, the Rs part; the same as RebelMark's keyframes. */
export const MARK_PHASES = {
  meet: [0.045, 0.5],
  wink: [0.636, 0.841],
  shut: [0.713, 0.764],
} as const

/** The right eye's lid, the left's squint, and the closed eye's line, in the
 * mark's units with the Rs met; a lid drops `MARK_LID_DROP` to close. */
export const MARK_WINK_LID = 'M240 140H302V230Q271 242 240 230Z'
export const MARK_SQUINT_LID = 'M185 140H245V193Q215 197 185 193Z'
export const MARK_SHUT_EYE = 'M250 222Q271 232 292 222'
export const MARK_LID_DROP = 50

/** Where the intro stands at `progress` (0 to 1): how far each R has moved
 * in, how far the lids have closed (0 open, 1 shut), and whether the right
 * eye shows as shut. */
export interface MarkPose {
  offset: number
  lid: number
  shut: boolean
}

const easeInOut = (t: number): number =>
  t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2
const share = (p: number, [from, to]: readonly [number, number]): number =>
  Math.min(1, Math.max(0, (p - from) / (to - from)))

/** The mark's pose at `progress` through its intro (R-LOOK-5). */
export function markPose(progress: number): MarkPose {
  const p = Math.min(1, Math.max(0, progress))
  const travel = MARK_OVERLAP - MARK_APART
  const [, winkEnd] = MARK_PHASES.wink
  const moved =
    p < winkEnd
      ? easeInOut(share(p, MARK_PHASES.meet))
      : 1 - easeInOut(share(p, [winkEnd, 1]))
  const [winkStart] = MARK_PHASES.wink
  const [shutStart, shutEnd] = MARK_PHASES.shut
  const lid =
    p < shutStart
      ? share(p, [winkStart, shutStart]) ** 2
      : 1 - share(p, [shutEnd, winkEnd]) ** 2
  return {
    offset: MARK_APART + travel * moved,
    lid: p >= winkEnd ? 0 : lid,
    shut: p >= shutStart && p < shutEnd,
  }
}
